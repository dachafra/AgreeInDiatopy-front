"""Small, dependency-free web layer for AgreeInDiatopy.

Run with:
    python web_server.py
"""

from __future__ import annotations

import argparse
import json
import os
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
MAX_BODY_BYTES = 5 * 1024 * 1024
ANALYSIS_LOCK = threading.Lock()


def _agreement(subject_number: str, verb_number: str) -> str:
    if not subject_number or not verb_number:
        return "unknown"
    return "match" if subject_number == verb_number else "mismatch"


def _serialize_tokens(sentence) -> list[dict[str, Any]]:
    return [
        {
            "id": token.i + 1,
            "text": token.text,
            "lemma": token.lemma_,
            "pos": token.pos_,
            "tag": token.tag_,
            "morphology": str(token.morph) or "—",
            "head": token.head.i + 1,
            "dependency": token.dep_,
        }
        for token in sentence
    ]


def analyze_text(text: str) -> dict[str, Any]:
    # Keep the static app and health endpoint available even before the NLP
    # dependencies are installed; analysis itself still requires
    # requirements-deploy.txt.
    from subject_verb_extractor.analyze import extract_verb_info
    from subject_verb_extractor.parse import spacy_stanza_parse

    text = text.strip()
    if not text:
        raise ValueError("Enter a sentence or choose a non-empty .txt file.")

    # Stanza pipelines are expensive and not designed to be mutated or invoked
    # concurrently, so serialize access while the shared pipeline is in use.
    with ANALYSIS_LOCK:
        sentences = spacy_stanza_parse(text)
        sentence_results = [
            extract_verb_info(sentence) for sentence in sentences
        ]

    analyses: list[dict[str, Any]] = []
    agreement_count = 0
    match_count = 0
    token_count = 0

    for sentence_index, (sentence, results) in enumerate(
        zip(sentences, sentence_results), start=1
    ):
        tokens = _serialize_tokens(sentence)
        token_count += len(tokens)

        for result in results:
            status = _agreement(result["subj_number"], result["verb_number"])
            if status != "unknown":
                agreement_count += 1
                if status == "match":
                    match_count += 1

            analyses.append(
                {
                    "id": len(analyses) + 1,
                    "sentence_number": sentence_index,
                    "full_sentence": result["sentence"],
                    "clause": result["full_predicate"],
                    "subject": result["nsubj"],
                    "pre_subject": result["pre_nsubj_text"].strip(),
                    "post_subject": result["post_nsubj_text"].strip(),
                    "between_subject_verb": result[
                        "between_subj_verb_text"
                    ].strip(),
                    "polarity": result["polarity"],
                    "inversion": (
                        "EX"
                        if result["is_existential_there"]
                        else "SV"
                        if result["nsubj_index"] < result["verb_index"]
                        else "VS"
                    ),
                    "full_subject": result["full_subject"],
                    "verb": result["verb"],
                    "verb_number": result["verb_number"],
                    "verb_person": result["verb_person"],
                    "verb_tense": result["verb_tense"],
                    "is_root": result["is_root"],
                    "existential_there": result["is_existential_there"],
                    "subject_elided": result["nsubj_elided"],
                    "subject_number": result["subj_number"],
                    "agreement": status,
                    "tokens": tokens,
                }
            )

    return {
        "analyses": analyses,
        "statistics": {
            "sentences": len(sentences),
            "tokens": token_count,
            "evaluated": agreement_count,
            "matches": match_count,
            "mismatches": agreement_count - match_count,
            "language": "English",
        },
    }


class AgreeInDiatopyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def _json(self, payload: dict[str, Any], status=HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        # This is a local testing server: always serve the latest HTML, CSS,
        # JavaScript, and API responses after a refresh.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if urlsplit(self.path).path == "/api/health":
            self._json({"status": "ok"})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/api/analyze":
            self._json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length < 0:
                raise ValueError("Invalid Content-Length header.")
            if content_length > MAX_BODY_BYTES:
                self._json(
                    {"error": "The input exceeds the 5 MB limit."},
                    HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                )
                return
            payload = json.loads(self.rfile.read(content_length))
            text = payload.get("text", "")
            if not isinstance(text, str):
                raise ValueError("The text field must be a string.")
            self._json(analyze_text(text))
        except (ValueError, json.JSONDecodeError) as error:
            self._json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.log_error("Analysis failed: %s", error)
            self._json(
                {"error": "The analysis could not be completed. Please try again."},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def log_message(self, format: str, *args: Any) -> None:
        if os.environ.get("AGREEINDIATOPY_QUIET") != "1":
            super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the AgreeInDiatopy web app.")
    parser.add_argument(
        "--host", default=os.environ.get("HOST", "127.0.0.1")
    )
    parser.add_argument(
        "--port", type=int, default=int(os.environ.get("PORT", "8000"))
    )
    args = parser.parse_args()

    if os.environ.get("AGREEINDIATOPY_PRELOAD_MODEL", "0").lower() in {
        "1",
        "true",
        "yes",
    }:
        from subject_verb_extractor.parse import preload_stanza_pipeline

        print("Loading the bundled English language model...")
        preload_stanza_pipeline()

    server = ThreadingHTTPServer((args.host, args.port), AgreeInDiatopyHandler)
    server.daemon_threads = True
    print(f"AgreeInDiatopy is running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

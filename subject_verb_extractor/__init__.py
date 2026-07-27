__all__ = ["analyze_doc", "analyze_corpus"]


def __getattr__(name):
    """Load the command-line controller only when its exports are requested.

    Importing a lightweight submodule (as the web API does) no longer pulls in
    pandas, tqdm, and the pre-parsed corpus machinery.
    """
    if name in __all__:
        from .controller import analyze_corpus, analyze_doc

        return {
            "analyze_doc": analyze_doc,
            "analyze_corpus": analyze_corpus,
        }[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

const VARIABLES = [
  ["full_sentence", "Full sentence", "The complete sentence as provided."],
  ["clause", "Clause", "The clause containing the main verb."],
  ["subject", "Subject (nsubj)", "The grammatical subject head."],
  ["pre_subject", "Pre-subject span", "Words before the subject head."],
  ["post_subject", "Post-subject span", "Words after the subject head."],
  ["between_subject_verb", "Between subject and verb", "Words between subject and verb."],
  ["polarity", "Polarity", "Positive, negative, or neutral."],
  ["inversion", "Inversion", "Subject–verb order: SV, VS, or EX."],
  ["full_subject", "Full subject", "The complete subject phrase."],
  ["verb", "Verb", "The finite verb phrase."],
  ["verb_number", "Verb number", "Singular or plural verb number."],
  ["verb_person", "Verb person", "Grammatical person of the verb."],
  ["verb_tense", "Verb tense", "Tense of the verb."],
  ["is_root", "Is root/main", "Whether the verb is the sentence root."],
  ["existential_there", "Existential there", "Whether the clause uses existential there."],
  ["subject_elided", "Subject elided", "Whether the subject is elided."],
];

const state = { mode: "text", fileText: "", fileName: "", data: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function buildVariableList() {
  $("#variable-list").innerHTML = VARIABLES.map(
    ([key, label, description]) => `
      <label class="variable-item">
        <input type="checkbox" value="${key}" checked />
        <span class="variable-name">${label}</span>
        <span class="variable-description">${description}</span>
      </label>`
  ).join("");
}

function selectedVariables() {
  const selected = new Set(
    $$("#variable-list input:checked").map((input) => input.value)
  );
  return VARIABLES.filter(([key]) => selected.has(key));
}

function setMode(mode) {
  state.mode = mode;
  $$(".mode-tab").forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $("#text-panel").classList.toggle("hidden", mode !== "text");
  $("#file-panel").classList.toggle("hidden", mode !== "file");
  $("#analyze-button").textContent =
    mode === "text" ? "Analyze text" : "Analyze corpus";
}

function bytesLabel(bytes) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function acceptFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".txt") && file.type !== "text/plain") {
    showToast("Please choose a .txt file.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("The file exceeds the 5 MB limit.");
    return;
  }
  state.fileText = await file.text();
  state.fileName = file.name;
  $("#file-name").textContent = file.name;
  $("#file-meta").textContent = `${bytesLabel(file.size)} · UTF-8 text`;
  $("#file-preview").textContent =
    state.fileText.split(/\r?\n/).slice(0, 5).join("\n") || "(Empty file)";
  $("#file-summary").classList.remove("hidden");
  $("#file-preview").classList.remove("hidden");
}

function clearFile() {
  state.fileText = "";
  state.fileName = "";
  $("#file-input").value = "";
  $("#file-summary").classList.add("hidden");
  $("#file-preview").classList.add("hidden");
}

function clearAll() {
  $("#sentence-input").value = "";
  clearFile();
  state.data = null;
  $("#results").classList.add("hidden");
  $("#statistics").classList.add("hidden");
  $("#status-message").textContent = "Choose one input mode and start the analysis.";
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 3500);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayValue(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value === "" || value == null ? "—" : String(value);
}

function renderStatistics(stats) {
  const items = [
    ["Sentences in corpus", stats.sentences, ""],
    ["Tokens in corpus", stats.tokens.toLocaleString(), ""],
    ["Agreements evaluated", stats.evaluated, ""],
    ["Matches", stats.matches, "good"],
    ["Mismatches", stats.mismatches, "bad"],
    ["Supported language", stats.language, ""],
  ];
  $("#stats-grid").innerHTML = items
    .map(
      ([label, value, tone]) =>
        `<div class="stat ${tone}"><small>${label}</small><strong>${value}</strong></div>`
    )
    .join("");
  $("#statistics").classList.remove("hidden");
}

function renderSelectedResult(index) {
  const result = state.data.analyses[index];
  if (!result) return;
  $("#selected-sentence").textContent = result.full_sentence;
  const badge = $("#agreement-badge");
  badge.className = `agreement-badge ${result.agreement}`;
  badge.textContent = result.agreement;

  $("#token-strip").innerHTML = result.tokens
    .map(
      (token) => `<div class="token">
        <small>${token.id}</small>
        <strong>${escapeHtml(token.text)}</strong>
        <small>${escapeHtml(token.pos)}</small>
      </div>`
    )
    .join("");

  $("#token-body").innerHTML = result.tokens
    .map(
      (token) => `<tr>
        <td>${token.id}</td><td>${escapeHtml(token.text)}</td>
        <td>${escapeHtml(token.lemma)}</td><td>${escapeHtml(token.pos)}</td>
        <td>${escapeHtml(token.morphology)}</td><td>${token.head}</td>
        <td>${escapeHtml(token.dependency)}</td>
      </tr>`
    )
    .join("");

  const statusText = {
    match: ["✓", "Match", `The ${result.subject_number.toLowerCase()} subject “${result.subject}” agrees with “${result.verb}”.`],
    mismatch: ["×", "Mismatch", `The subject “${result.subject}” and “${result.verb}” have different number values.`],
    unknown: ["?", "Not evaluated", "The parser did not provide enough number information to compare agreement."],
  }[result.agreement];
  const agreementCard = $("#agreement-card");
  agreementCard.className = `agreement-card ${result.agreement}`;
  agreementCard.innerHTML = `
    <small>Subject–verb agreement</small>
    <span class="status-icon">${statusText[0]}</span>
    <h4>${statusText[1]}</h4>
    <p>${escapeHtml(statusText[2])}</p>`;
}

function renderOutputTable() {
  if (!state.data) return;
  const variables = selectedVariables();
  $("#download-button").disabled =
    state.data.analyses.length === 0 || variables.length === 0;
  if (variables.length === 0) {
    $("#output-head").innerHTML = "<tr><th>Output</th></tr>";
    $("#output-body").innerHTML =
      "<tr><td>Select at least one variable to build the output table.</td></tr>";
    return;
  }
  $("#output-head").innerHTML = `<tr>${variables
    .map(([, label]) => `<th>${escapeHtml(label)}</th>`)
    .join("")}</tr>`;
  $("#output-body").innerHTML = state.data.analyses
    .map(
      (result) => `<tr>${variables
        .map(([key]) => `<td>${escapeHtml(displayValue(result[key]))}</td>`)
        .join("")}</tr>`
    )
    .join("");
}

function renderResults(data) {
  state.data = data;
  $("#results").classList.remove("hidden");
  renderStatistics(data.statistics);
  const empty = data.analyses.length === 0;
  $("#result-empty").classList.toggle("hidden", !empty);
  $("#result-content").classList.toggle("hidden", empty);
  $("#download-button").disabled = empty;
  $("#result-summary").textContent = empty
    ? "Analysis complete"
    : `${data.analyses.length} subject–verb construction${data.analyses.length === 1 ? "" : "s"} found`;
  if (!empty) {
    $("#result-select").innerHTML = data.analyses
      .map(
        (result, index) =>
          `<option value="${index}">${index + 1}. ${escapeHtml(result.full_sentence.slice(0, 82))}</option>`
      )
      .join("");
    renderSelectedResult(0);
    renderOutputTable();
  }
  $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function analyze() {
  const text =
    state.mode === "text" ? $("#sentence-input").value.trim() : state.fileText.trim();
  if (!text) {
    showToast(
      state.mode === "text"
        ? "Enter at least one sentence."
        : "Choose a non-empty .txt file."
    );
    return;
  }
  if (selectedVariables().length === 0) {
    showToast("Select at least one output variable.");
    return;
  }

  const button = $("#analyze-button");
  button.disabled = true;
  button.textContent = "Analyzing…";
  $("#status-message").textContent =
    "The first analysis may take a moment while the language model loads.";
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Analysis failed.");
    renderResults(payload);
    $("#status-message").textContent = "Analysis completed successfully.";
  } catch (error) {
    showToast(error.message);
    $("#status-message").textContent = "The analysis was not completed.";
  } finally {
    button.disabled = false;
    button.textContent = state.mode === "text" ? "Analyze text" : "Analyze corpus";
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv() {
  if (!state.data?.analyses.length) return;
  const variables = selectedVariables();
  if (variables.length === 0) {
    showToast("Select at least one output variable.");
    return;
  }
  const lines = [
    variables.map(([, label]) => csvCell(label)).join(","),
    ...state.data.analyses.map((row) =>
      variables.map(([key]) => csvCell(displayValue(row[key]))).join(",")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.fileName.replace(/\.txt$/i, "") || "agreeindiatopy"}_analysis.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function bindEvents() {
  $$(".mode-tab").forEach((tab) =>
    tab.addEventListener("click", () => setMode(tab.dataset.mode))
  );
  $$("#examples button").forEach((button) =>
    button.addEventListener("click", () => {
      setMode("text");
      $("#sentence-input").value = button.dataset.example;
    })
  );
  $("#drop-zone").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (event) =>
    acceptFile(event.target.files[0])
  );
  ["dragenter", "dragover"].forEach((name) =>
    $("#drop-zone").addEventListener(name, (event) => {
      event.preventDefault();
      $("#drop-zone").classList.add("dragging");
    })
  );
  ["dragleave", "drop"].forEach((name) =>
    $("#drop-zone").addEventListener(name, (event) => {
      event.preventDefault();
      $("#drop-zone").classList.remove("dragging");
    })
  );
  $("#drop-zone").addEventListener("drop", (event) =>
    acceptFile(event.dataTransfer.files[0])
  );
  $("#remove-file").addEventListener("click", clearFile);
  $("#clear-button").addEventListener("click", clearAll);
  $("#analyze-button").addEventListener("click", analyze);
  $("#select-all").addEventListener("click", () => {
    $$("#variable-list input").forEach((input) => (input.checked = true));
    renderOutputTable();
  });
  $("#clear-all").addEventListener("click", () => {
    $$("#variable-list input").forEach((input) => (input.checked = false));
    renderOutputTable();
  });
  $("#variable-list").addEventListener("change", renderOutputTable);
  $("#result-select").addEventListener("change", (event) =>
    renderSelectedResult(Number(event.target.value))
  );
  $("#download-button").addEventListener("click", downloadCsv);
}

buildVariableList();
bindEvents();

const VARIABLES = [
  ["full_sentence", "Full sentence", "The complete sentence as provided."],
  ["clause", "Clause", "The clause containing the main verb."],
  ["dependency", "Dependency", "Main/non-main status and the verb dependency."],
  ["polarity", "Polarity", "Positive, negative, or neutral."],
  ["inversion", "Inversion", "Subject–verb order: SV, VS, or EX."],
  ["verb", "Verb form", "The complete finite verb phrase."],
  ["verb_number", "Verb number", "Singular or plural verb number."],
  ["verb_person", "Verb person", "Grammatical person of the verb."],
  ["verb_tense", "Verb tense", "Tense of the finite verb."],
  ["verb_dependency", "Verb dependency", "The dependency relation of the verb."],
  ["verb_index", "Finite verb index", "One-based position of the finite verb."],
  ["lexical_verb_index", "Lexical verb index", "One-based position of the lexical verb."],
  ["subject", "Subject (nsubj)", "The grammatical subject head."],
  ["full_subject", "Full subject", "The complete subject phrase."],
  ["subject_number", "Subject number", "Singular or plural subject number."],
  ["subject_number_source", "Subject number source", "How subject number was obtained."],
  ["subject_category", "Subject category", "POS, tag, and dependency combined."],
  ["subject_pos", "Subject POS", "Universal part of speech of the subject."],
  ["subject_tag", "Subject tag", "Language-specific POS tag of the subject."],
  ["subject_dependency", "Subject dependency", "Dependency relation of the subject."],
  ["subject_index", "Subject index", "One-based position of the subject head."],
  ["subject_length", "Subject length", "Non-punctuation tokens in the full subject."],
  ["subject_head_length", "Subject head length", "Non-punctuation tokens in the subject head."],
  ["subject_elided", "Subject elided", "Whether the subject is inherited or elided."],
  ["pre_subject", "Pre-subject span", "Words before the subject head."],
  ["pre_subject_length", "Pre-subject length", "Non-punctuation tokens before the subject head."],
  ["pre_subject_components", "Pre-subject components", "Constituent details before the subject head."],
  ["has_pre_subject", "Has pre-subject", "Whether a pre-subject span is present."],
  ["post_subject", "Post-subject span", "Words after the subject head."],
  ["post_subject_length", "Post-subject length", "Non-punctuation tokens after the subject head."],
  ["post_subject_components", "Post-subject components", "Constituent details after the subject head."],
  ["has_post_subject", "Has post-subject", "Whether a post-subject span is present."],
  ["between_subject_verb", "Between subject and verb", "Words between subject and verb."],
  ["between_subject_verb_length", "Between span length", "Non-punctuation tokens between subject and verb."],
  ["between_subject_verb_components", "Between span components", "Constituent details between subject and verb."],
  ["has_between_subject_verb", "Has between span", "Whether material occurs between subject and verb."],
  ["is_root", "Is root/main", "Whether the verb is the sentence root."],
  ["existential_there", "Existential there", "Whether the clause uses existential there."],
  ["agreement", "Agreement result", "Binary match or mismatch classification."],
];

const state = {
  mode: "text",
  fileText: "",
  fileName: "",
  data: null,
  selectedIndex: 0,
  resultTab: "overview",
};
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
  $("#category-examples").classList.add("hidden");
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
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const category = [item.cat, item.tag, item.dep].filter(Boolean).join("_");
          return `${item.form || "—"}${category ? ` [${category}]` : ""}${item.length != null ? ` (${item.length})` : ""}`;
        }
        return String(item);
      })
      .join("; ");
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  return value === "" || value == null ? "—" : String(value);
}

function renderStatistics(stats) {
  const items = [
    ["Sentences in corpus", stats.sentences, "", ""],
    ["Tokens in corpus", stats.tokens.toLocaleString(), "", ""],
    ["Agreements evaluated", stats.evaluated, "", ""],
    ["Matches", stats.matches, "good", "match"],
    ["Mismatches", stats.mismatches, "bad", "mismatch"],
    ["Supported language", stats.language, "", ""],
  ];
  $("#stats-grid").innerHTML = items
    .map(
      ([label, value, tone, category]) =>
        category
          ? `<button class="stat ${tone} interactive" data-category="${category}" type="button">
              <small>${label}</small><strong>${value}</strong><span>View examples →</span>
            </button>`
          : `<div class="stat ${tone}"><small>${label}</small><strong>${value}</strong></div>`
    )
    .join("");
  $("#statistics").classList.remove("hidden");
}

function renderSelectedResult(index) {
  const result = state.data.analyses[index];
  if (!result) return;
  state.selectedIndex = index;
  $("#result-select").value = String(index);
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

  const inferredNote =
    result.subject_number_source === "stanza"
      ? ""
      : ` Subject number was inferred via ${result.subject_number_source}.`;
  const statusText = {
    match: ["✓", "Match", `The ${result.subject_number.toLowerCase()} subject “${result.subject}” agrees with “${result.verb}”.${inferredNote}`],
    mismatch: ["×", "Mismatch", `The ${result.subject_number.toLowerCase()} subject “${result.subject}” and “${result.verb}” have different number values.${inferredNote}`],
  }[result.agreement];
  const agreementCard = $("#agreement-card");
  agreementCard.className = `agreement-card ${result.agreement}`;
  agreementCard.innerHTML = `
    <small>Subject–verb agreement</small>
    <span class="status-icon">${statusText[0]}</span>
    <h4>${statusText[1]}</h4>
    <p>${escapeHtml(statusText[2])}</p>`;

  renderDependencyTree(result.tokens);
}

function setResultTab(tab) {
  state.resultTab = tab;
  $$(".result-tab").forEach((button) => {
    const active = button.dataset.resultTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("#overview-panel").classList.toggle("hidden", tab !== "overview");
  $("#dependency-panel").classList.toggle("hidden", tab !== "dependency");
  if (tab === "dependency" && state.data?.analyses[state.selectedIndex]) {
    renderDependencyTree(state.data.analyses[state.selectedIndex].tokens);
  }
}

function renderDependencyTree(tokens) {
  const container = $("#dependency-tree");
  if (!tokens.length) {
    container.innerHTML = '<p class="tree-empty">No dependency parse is available.</p>';
    return;
  }

  const step = 96;
  const padding = 58;
  const width = Math.max(container.clientWidth || 0, padding * 2 + step * (tokens.length - 1));
  const maxSpan = Math.max(
    1,
    ...tokens.map((token) => Math.abs(token.id - token.head))
  );
  const baseline = Math.min(390, 105 + maxSpan * 25);
  const height = baseline + 78;
  const x = (id) => padding + (id - 1) * step;
  const edges = tokens
    .map((token) => {
      const dependentX = x(token.id);
      if (token.is_root || token.head === token.id) {
        return `
          <path class="dep-edge root-edge" d="M ${dependentX} 18 L ${dependentX} ${baseline - 10}" marker-end="url(#arrow-root)" />
          <text class="dep-label root-label" x="${dependentX + 7}" y="25">root</text>`;
      }
      const headX = x(token.head);
      const span = Math.abs(token.id - token.head);
      const arcHeight = Math.min(baseline - 30, 34 + span * 24);
      const top = baseline - arcHeight;
      const middle = (headX + dependentX) / 2;
      const subjectClass = token.dependency.startsWith("nsubj") ? " subject-edge" : "";
      return `
        <path class="dep-edge${subjectClass}" d="M ${headX} ${baseline - 10} C ${headX} ${top}, ${dependentX} ${top}, ${dependentX} ${baseline - 10}" marker-end="url(#arrow${subjectClass ? "-subject" : ""})" />
        <text class="dep-label${subjectClass}" x="${middle}" y="${top - 5}">${escapeHtml(token.dependency)}</text>`;
    })
    .join("");
  const nodes = tokens
    .map(
      (token) => `
        <g class="dep-token" transform="translate(${x(token.id)}, ${baseline})">
          <circle r="4"></circle>
          <text class="dep-word" text-anchor="middle" y="25">${escapeHtml(token.text)}</text>
          <text class="dep-pos" text-anchor="middle" y="43">${escapeHtml(token.pos)}</text>
          <text class="dep-id" text-anchor="middle" y="58">${token.id}</text>
        </g>`
    )
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Dependency tree for the selected sentence">
      <defs>
        <marker id="arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z"></path></marker>
        <marker id="arrow-subject" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z"></path></marker>
        <marker id="arrow-root" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z"></path></marker>
      </defs>
      ${edges}
      ${nodes}
    </svg>`;
}

function showCategoryExamples(category) {
  if (!state.data) return;
  const examples = state.data.analyses
    .map((analysis, index) => ({ analysis, index }))
    .filter(({ analysis }) => analysis.agreement === category);
  const label = category === "match" ? "Matches" : "Mismatches";
  $("#category-title").textContent = label;
  $("#category-summary").textContent =
    `${examples.length} construction${examples.length === 1 ? "" : "s"} in this category.`;
  $("#category-list").innerHTML = examples.length
    ? examples
        .map(
          ({ analysis, index }) => `
            <button class="category-example" type="button" data-result-index="${index}">
              <span>${index + 1}</span>
              <span>
                <strong>${escapeHtml(analysis.full_sentence)}</strong>
                <small>${escapeHtml(analysis.subject)} · ${escapeHtml(analysis.verb)}</small>
              </span>
            </button>`
        )
        .join("")
    : '<p class="category-empty">There are no examples in this category.</p>';
  $("#category-examples").classList.remove("hidden");
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
  state.selectedIndex = 0;
  $("#category-examples").classList.add("hidden");
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
    setResultTab("overview");
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
    const response = await fetch("api/analyze", {
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
  $$(".result-tab").forEach((tab) =>
    tab.addEventListener("click", () => setResultTab(tab.dataset.resultTab))
  );
  $("#stats-grid").addEventListener("click", (event) => {
    const stat = event.target.closest("[data-category]");
    if (stat) showCategoryExamples(stat.dataset.category);
  });
  $("#category-list").addEventListener("click", (event) => {
    const example = event.target.closest("[data-result-index]");
    if (!example) return;
    renderSelectedResult(Number(example.dataset.resultIndex));
    setResultTab("overview");
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#close-category").addEventListener("click", () =>
    $("#category-examples").classList.add("hidden")
  );
  $("#download-button").addEventListener("click", downloadCsv);
}

buildVariableList();
bindEvents();

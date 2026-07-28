(() => {
  "use strict";

  const CUSTOM_STORAGE_KEY = "rif-resonance.custom-scripts.v1";
  const LIBRARY_STORAGE_KEY = "rif-resonance.authorized-library.v1";
  const PREFERENCES_STORAGE_KEY = "rif-resonance.preferences.v1";
  const LIBRARY_FORMAT = "rif-resonance-script-library";
  const LIBRARY_VERSION = 1;
  const AUTHORIZED_LIBRARY_ID = "rif-resonance-original-library-874-v1";
  const DEFAULT_PREFERENCES = Object.freeze({ volume: 15, waveform: "sine", runMode: "original" });
  const el = (id) => document.getElementById(id);
  const ui = {
    libraryGate: el("libraryGate"), libraryGateStatus: el("libraryGateStatus"), workspace: el("workspace"),
    loadLibrary: el("loadLibraryButton"), libraryInput: el("libraryFileInput"),
    changeLibrary: el("changeLibraryButton"), accessInfo: el("accessInfo"),
    libraryCount: el("libraryCount"), resultCount: el("resultCount"), search: el("searchInput"),
    customScripts: el("customScriptsButton"), preferences: el("preferencesButton"),
    list: el("scriptList"), title: el("selectedTitle"), meta: el("sequenceMeta"), state: el("statePill"),
    stepLabel: el("stepLabel"), time: el("timeLabel"), frequency: el("frequencyValue"), channels: el("channelValues"),
    progress: el("progressFill"), rangeNote: el("rangeNote"), previous: el("previousButton"), play: el("playButton"),
    next: el("nextButton"), stop: el("stopButton"), volume: el("volumeInput"), volumeOutput: el("volumeOutput"),
    waveform: el("waveformSelect"), runMode: el("runModeSelect"), sequence: el("sequenceBody"), audioInfo: el("audioInfo"),
    newScript: el("newScriptButton"), importScript: el("importScriptButton"), importInput: el("importScriptInput"),
    editScript: el("editScriptButton"), exportScript: el("exportScriptButton"),
    deleteSelectedScript: el("deleteSelectedScriptButton"), editor: el("scriptEditor"),
    editorHeading: el("editorHeading"), closeEditor: el("closeEditorButton"), cancelEditor: el("cancelEditorButton"),
    scriptName: el("scriptNameInput"), editorRows: el("editorToneRows"), editorStatus: el("editorStatus"),
    addTone: el("addToneButton"), deleteScript: el("deleteScriptButton"), saveRTS: el("saveRTSButton"),
    saveLibrary: el("saveLibraryButton"), preferencesDialog: el("preferencesDialog"),
    closePreferences: el("closePreferencesButton"), cancelPreferences: el("cancelPreferencesButton"),
    savePreferences: el("savePreferencesButton"), resetPreferences: el("resetPreferencesButton"),
    preferencesVolume: el("preferencesVolumeInput"), preferencesVolumeOutput: el("preferencesVolumeOutput"),
    preferencesWaveform: el("preferencesWaveformSelect"), preferencesRunMode: el("preferencesRunModeSelect"),
    testOutput: el("testOutputButton"), openSoundSettings: el("openSoundSettingsButton"),
    outputTestStatus: el("outputTestStatus")
  };

  const formatNumber = (number) => Number.isInteger(number)
    ? String(number)
    : String(number).replace(/0+$/, "").replace(/\.$/, "");

  const formatTime = (seconds) => {
    const safe = Math.max(0, Math.round(seconds));
    const hours = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    return hours > 0
      ? `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  function normalizeStoredTone(tone) {
    const normalized = {
      frequency: Number(tone?.frequency),
      duration: Number(tone?.duration),
      phase: Number(tone?.phase ?? 0),
      left: Number(tone?.left ?? 100),
      right: Number(tone?.right ?? 100)
    };
    const valid = Number.isFinite(normalized.frequency) && normalized.frequency >= 0
      && Number.isFinite(normalized.duration) && normalized.duration > 0
      && Number.isFinite(normalized.phase)
      && Number.isFinite(normalized.left) && normalized.left >= 0 && normalized.left <= 100
      && Number.isFinite(normalized.right) && normalized.right >= 0 && normalized.right <= 100;
    if (!valid) return null;
    const note = String(tone?.note || "").trim();
    return note ? { ...normalized, note } : normalized;
  }

  function normalizeLibraryScript(script, index) {
    const title = String(script?.title || "").trim();
    const source = String(script?.source || `${title || `Script_${index + 1}`}.rts`).trim();
    const tones = Array.isArray(script?.tones) ? script.tones.map(normalizeStoredTone).filter(Boolean) : [];
    if (!title || !tones.length) throw new Error(`Script ${index + 1} is missing a title or valid tone steps.`);
    return { title, source, tones };
  }

  function parseScriptLibrary(content) {
    let packageData;
    try {
      packageData = JSON.parse(String(content));
    } catch (_) {
      throw new Error("This is not a readable RIF Resonance library file.");
    }
    if (packageData?.format !== LIBRARY_FORMAT
      || Number(packageData?.version) !== LIBRARY_VERSION
      || packageData?.libraryId !== AUTHORIZED_LIBRARY_ID) {
      throw new Error("This file is not an authorized RIF Resonance script library.");
    }
    if (!Array.isArray(packageData.scripts) || !packageData.scripts.length) {
      throw new Error("The script library is empty.");
    }
    const scripts = packageData.scripts.map(normalizeLibraryScript);
    const toneCount = scripts.reduce((sum, script) => sum + script.tones.length, 0);
    if (Number(packageData.scriptCount) !== scripts.length || Number(packageData.toneCount) !== toneCount) {
      throw new Error("The script library is incomplete or its counts do not match.");
    }
    const uniqueSources = new Set(scripts.map((script) => script.source.toLocaleLowerCase()));
    if (uniqueSources.size !== scripts.length) throw new Error("The script library contains duplicate source names.");
    return {
      format: LIBRARY_FORMAT,
      version: LIBRARY_VERSION,
      libraryId: String(packageData.libraryId || "authorized-library"),
      title: String(packageData.title || "RIF Resonance Script Library"),
      scriptCount: scripts.length,
      toneCount,
      scripts
    };
  }

  function readFileAsText(file) {
    const readWithFileReader = () => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(new Error("This device could not read the selected file.")), { once: true });
      reader.addEventListener("abort", () => reject(new Error("File selection was cancelled.")), { once: true });
      reader.readAsText(file, "utf-8");
    });

    if (typeof file?.text !== "function") return readWithFileReader();
    return file.text().catch(readWithFileReader);
  }

  function loadAuthorizedLibrary() {
    try {
      const stored = localStorage.getItem(LIBRARY_STORAGE_KEY);
      return stored ? parseScriptLibrary(stored) : null;
    } catch (_) {
      localStorage.removeItem(LIBRARY_STORAGE_KEY);
      return null;
    }
  }

  function loadCustomScripts() {
    try {
      const stored = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) || "[]");
      if (!Array.isArray(stored)) return [];
      return stored.flatMap((script, index) => {
        const title = String(script?.title || "").trim();
        const tones = Array.isArray(script?.tones) ? script.tones.map(normalizeStoredTone).filter(Boolean) : [];
        if (!title || !tones.length) return [];
        return [{
          id: String(script.id || `restored-${index}-${Date.now()}`),
          title,
          source: String(script.source || `${title}.rts`),
          tones,
          custom: true
        }];
      });
    } catch (_) {
      return [];
    }
  }

  function normalizePreferences(value) {
    const volume = Math.max(0, Math.min(100, Number(value?.volume)));
    const waveform = ["sine", "square", "triangle"].includes(value?.waveform) ? value.waveform : DEFAULT_PREFERENCES.waveform;
    const runMode = ["original", "preview"].includes(value?.runMode) ? value.runMode : DEFAULT_PREFERENCES.runMode;
    return {
      volume: Number.isFinite(volume) ? Math.round(volume) : DEFAULT_PREFERENCES.volume,
      waveform,
      runMode
    };
  }

  function loadPreferences() {
    try {
      const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      return stored ? normalizePreferences(JSON.parse(stored)) : { ...DEFAULT_PREFERENCES };
    } catch (_) {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  let authorizedLibrary = loadAuthorizedLibrary();
  let libraryScripts = authorizedLibrary?.scripts || [];
  let customScripts = loadCustomScripts();
  let preferences = loadPreferences();
  const scripts = libraryScripts.length ? [...libraryScripts, ...customScripts] : [];
  let editingCustomId = null;
  let editorSourceName = "";

  const state = {
    filtered: scripts,
    scriptIndex: Math.max(0, scripts.findIndex((script) => script.title === "Wellness")),
    stepIndex: 0,
    mode: "idle",
    audioContext: null,
    sourceNodes: [],
    testOutputNodes: [],
    showCustomOnly: false,
    stepElapsed: 0,
    startedAt: 0,
    frame: 0
  };

  const currentScript = () => scripts[state.scriptIndex] || { title: "No scripts found", tones: [] };
  const currentTone = () => currentScript().tones[state.stepIndex];
  const toneDuration = (tone) => ui.runMode.value === "preview" ? Math.min(5, tone.duration) : tone.duration;
  const totalDuration = (script) => script.tones.reduce((sum, tone) => sum + tone.duration, 0);

  function rebuildScripts() {
    const available = libraryScripts.length ? [...libraryScripts, ...customScripts] : [];
    scripts.splice(0, scripts.length, ...available);
  }

  function applyPreferences(value) {
    preferences = normalizePreferences(value);
    ui.volume.value = String(preferences.volume);
    ui.volumeOutput.textContent = `${preferences.volume}%`;
    ui.waveform.value = preferences.waveform;
    ui.runMode.value = preferences.runMode;
  }

  function persistPreferences(value) {
    preferences = normalizePreferences(value);
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
      return true;
    } catch (_) {
      return false;
    }
  }

  function persistCurrentControls() {
    persistPreferences({ volume: ui.volume.value, waveform: ui.waveform.value, runMode: ui.runMode.value });
  }

  function updateLibrarySummary() {
    ui.customScripts.textContent = `Custom (${customScripts.length})`;
    ui.customScripts.classList.toggle("active", state.showCustomOnly);
    ui.customScripts.setAttribute("aria-pressed", state.showCustomOnly ? "true" : "false");
    if (!libraryScripts.length) {
      ui.libraryCount.textContent = "Script library required";
      ui.search.placeholder = "Library locked";
      return;
    }
    const customText = customScripts.length ? ` · ${customScripts.length} custom` : "";
    ui.libraryCount.textContent = `${libraryScripts.length.toLocaleString()} authorized${customText} · offline`;
    ui.search.placeholder = `Search ${scripts.length.toLocaleString()} scripts...`;
  }

  function setLibraryGateStatus(message, type = "") {
    ui.libraryGateStatus.textContent = message;
    ui.libraryGateStatus.className = `gate-status${type ? ` ${type}` : ""}`;
  }

  function updateLibraryAccess() {
    const unlocked = libraryScripts.length > 0;
    ui.libraryGate.hidden = unlocked;
    ui.workspace.hidden = !unlocked;
    ui.accessInfo.textContent = unlocked
      ? `Authorized library loaded locally: ${authorizedLibrary?.title || "RIF Resonance Script Library"}.`
      : "Locked until an authorized script library is selected.";
    updateLibrarySummary();
  }

  function activateScriptLibrary(packageData) {
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(packageData));
    } catch (_) {
      throw new Error("The library is valid, but this device could not save it locally.");
    }
    stopPlayback(false);
    authorizedLibrary = packageData;
    libraryScripts = packageData.scripts;
    rebuildScripts();
    state.scriptIndex = Math.max(0, scripts.findIndex((script) => script.title === "Wellness"));
    state.stepIndex = 0;
    state.stepElapsed = 0;
    ui.search.value = "";
    updateLibraryAccess();
    renderLibrary();
    renderSequence();
  }

  function renderLibrary() {
    const query = ui.search.value.trim().toLocaleLowerCase();
    const visibleScripts = state.showCustomOnly ? scripts.filter((script) => script.custom) : scripts;
    state.filtered = query
      ? visibleScripts.filter((script) => script.title.toLocaleLowerCase().includes(query))
      : visibleScripts;
    ui.resultCount.textContent = `${state.filtered.length} shown`;
    ui.list.replaceChildren();
    const fragment = document.createDocumentFragment();
    state.filtered.forEach((script) => {
      const index = scripts.indexOf(script);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `script-item${index === state.scriptIndex ? " selected" : ""}`;
      button.dataset.scriptIndex = index;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", index === state.scriptIndex ? "true" : "false");
      const itemNumber = script.custom ? `C${customScripts.indexOf(script) + 1}` : String(index + 1).padStart(2, "0");
      button.innerHTML = `<span class="script-number">${itemNumber}</span><span class="script-copy"><strong></strong><small><span class="custom-label"></span>${script.tones.length} tones · ${formatTime(totalDuration(script))}</small></span>`;
      button.querySelector("strong").textContent = script.title;
      button.querySelector(".custom-label").textContent = script.custom ? "Custom · " : "";
      button.addEventListener("click", () => selectScript(index));
      fragment.appendChild(button);
    });
    if (!state.filtered.length && state.showCustomOnly) {
      const empty = document.createElement("div");
      empty.className = "custom-empty";
      empty.textContent = customScripts.length
        ? "No custom scripts match this search."
        : "No custom scripts yet. Choose + New or Import .rts, then save the script to your library.";
      fragment.appendChild(empty);
    }
    ui.list.appendChild(fragment);
    updateLibrarySummary();
  }

  function renderSequence() {
    const script = currentScript();
    ui.title.textContent = script.title;
    ui.meta.textContent = `${script.tones.length} tones · ${formatTime(totalDuration(script))} original duration${script.custom ? " · Custom script" : ""}`;
    ui.editScript.textContent = script.custom ? "Edit custom" : "Edit copy";
    ui.deleteSelectedScript.hidden = !script.custom;
    ui.deleteSelectedScript.disabled = !script.custom;
    ui.sequence.replaceChildren();
    const fragment = document.createDocumentFragment();
    script.tones.forEach((tone, index) => {
      const row = document.createElement("tr");
      row.dataset.stepIndex = index;
      if (index === state.stepIndex) row.className = "current";
      const high = tone.frequency > 20000;
      row.innerHTML = `<td>${index + 1}</td><td${high ? ' class="unsupported"' : ""}>${formatNumber(tone.frequency)} Hz</td><td>${formatTime(tone.duration)}</td><td>L ${tone.left}% · R ${tone.right}%</td><td><span class="status-dot"></span>${high ? "Out of range" : index === state.stepIndex ? "Ready" : "Queued"}</td>`;
      row.addEventListener("click", () => jumpToStep(index));
      fragment.appendChild(row);
    });
    ui.sequence.appendChild(fragment);
    renderNow();
  }

  function renderNow() {
    const tone = currentTone();
    const script = currentScript();
    const hasTone = Boolean(tone);
    ui.frequency.textContent = hasTone ? formatNumber(tone.frequency) : "--";
    ui.stepLabel.textContent = hasTone ? `Tone ${state.stepIndex + 1} of ${script.tones.length}` : "No tones";
    ui.channels.textContent = hasTone ? `L ${tone.left}% · R ${tone.right}%` : "";
    const duration = hasTone ? toneDuration(tone) : 0;
    ui.time.textContent = `${formatTime(state.stepElapsed)} / ${formatTime(duration)}`;
    ui.progress.style.width = duration ? `${Math.min(100, state.stepElapsed / duration * 100)}%` : "0%";
    ui.previous.disabled = !hasTone || state.stepIndex === 0;
    ui.next.disabled = !hasTone || state.stepIndex >= script.tones.length - 1;
    ui.play.disabled = !hasTone;
    ui.stop.disabled = state.mode === "idle";
    ui.editScript.disabled = !script.tones.length;
    ui.exportScript.disabled = !script.tones.length;
    if (!hasTone) {
      ui.rangeNote.textContent = "This script contains no readable tone steps.";
      ui.rangeNote.className = "range-note warning";
    } else if (tone.frequency > 20000) {
      ui.rangeNote.textContent = "Outside the reliable mobile audio-output range. This step remains silent; use Next to skip it.";
      ui.rangeNote.className = "range-note warning";
    } else if (tone.frequency < 20) {
      ui.rangeNote.textContent = "Sub-audible frequency: most speakers and headphones will not reproduce it.";
      ui.rangeNote.className = "range-note warning";
    } else if (tone.note) {
      ui.rangeNote.textContent = tone.note;
      ui.rangeNote.className = "range-note";
    } else {
      ui.rangeNote.textContent = "Within the normal mobile audio-output range.";
      ui.rangeNote.className = "range-note";
    }
  }

  function setMode(mode) {
    state.mode = mode;
    const label = mode === "playing" ? "Playing" : mode === "paused" ? "Paused" : "Ready";
    ui.state.className = `state-pill ${mode}`;
    ui.state.querySelector("b").textContent = label;
    ui.play.classList.toggle("paused", mode === "playing");
    ui.play.querySelector("b").textContent = mode === "playing" ? "Pause" : mode === "paused" ? "Resume" : "Play sequence";
    ui.play.setAttribute("aria-label", mode === "playing" ? "Pause sequence" : mode === "paused" ? "Resume sequence" : "Play sequence");
    renderNow();
  }

  function selectScript(index) {
    stopPlayback(false);
    state.scriptIndex = Math.max(0, Math.min(index, scripts.length - 1));
    state.stepIndex = 0;
    state.stepElapsed = 0;
    renderLibrary();
    renderSequence();
  }

  function updateRowStates() {
    const rows = ui.sequence.querySelectorAll("tr");
    rows.forEach((row, index) => row.classList.toggle("current", index === state.stepIndex));
  }

  function jumpToStep(index) {
    const wasPlaying = state.mode === "playing";
    stopAudioNodes();
    state.stepIndex = index;
    state.stepElapsed = 0;
    updateRowStates();
    renderNow();
    if (wasPlaying) beginTone();
  }

  async function ensureAudio() {
    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioContextClass();
      ui.audioInfo.textContent = `Audio engine: ${state.audioContext.sampleRate.toLocaleString()} Hz sample rate`;
    }
    if (state.audioContext.state === "suspended") await state.audioContext.resume();
  }

  function stopAudioNodes() {
    state.sourceNodes.forEach((node) => {
      try { node.stop?.(); } catch (_) { /* already stopped */ }
      try { node.disconnect?.(); } catch (_) { /* already disconnected */ }
    });
    state.sourceNodes = [];
  }

  function buildToneGraph(tone) {
    if (tone.frequency > 20000) return;
    const ctx = state.audioContext;
    const oscillator = ctx.createOscillator();
    const leftGain = ctx.createGain();
    const rightGain = ctx.createGain();
    const master = ctx.createGain();
    const merger = ctx.createChannelMerger(2);
    const volume = Number(ui.volume.value) / 100;
    oscillator.type = ui.waveform.value;
    oscillator.frequency.setValueAtTime(Math.max(0.01, tone.frequency), ctx.currentTime);
    leftGain.gain.setValueAtTime(tone.left / 100, ctx.currentTime);
    rightGain.gain.setValueAtTime(tone.right / 100, ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.025);
    oscillator.connect(leftGain);
    oscillator.connect(rightGain);
    leftGain.connect(merger, 0, 0);
    rightGain.connect(merger, 0, 1);
    merger.connect(master);
    master.connect(ctx.destination);
    oscillator.start();
    state.sourceNodes = [oscillator, leftGain, rightGain, merger, master];
  }

  async function beginTone() {
    const tone = currentTone();
    if (!tone) return;
    await ensureAudio();
    stopAudioNodes();
    buildToneGraph(tone);
    state.startedAt = performance.now();
    setMode("playing");
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (state.mode !== "playing") return;
    const tone = currentTone();
    if (!tone) return stopPlayback(false);
    const elapsed = state.stepElapsed + (now - state.startedAt) / 1000;
    const duration = toneDuration(tone);
    ui.time.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    ui.progress.style.width = `${Math.min(100, elapsed / duration * 100)}%`;
    if (elapsed >= duration) {
      state.stepElapsed = 0;
      if (state.stepIndex < currentScript().tones.length - 1) {
        state.stepIndex += 1;
        updateRowStates();
        beginTone();
      } else {
        stopPlayback(true);
      }
      return;
    }
    state.frame = requestAnimationFrame(tick);
  }

  function pausePlayback() {
    if (state.mode !== "playing") return;
    state.stepElapsed += (performance.now() - state.startedAt) / 1000;
    stopAudioNodes();
    cancelAnimationFrame(state.frame);
    setMode("paused");
  }

  function stopPlayback(completed) {
    stopAudioNodes();
    cancelAnimationFrame(state.frame);
    state.stepElapsed = 0;
    if (completed) state.stepIndex = 0;
    setMode("idle");
    updateRowStates();
    renderNow();
  }

  function stopTestOutput() {
    state.testOutputNodes.forEach((node) => {
      try { node.stop?.(); } catch (_) { /* already stopped */ }
      try { node.disconnect?.(); } catch (_) { /* already disconnected */ }
    });
    state.testOutputNodes = [];
  }

  function setOutputStatus(message, type = "") {
    ui.outputTestStatus.textContent = message;
    ui.outputTestStatus.className = `output-status${type ? ` ${type}` : ""}`;
  }

  function openPreferencesDialog() {
    stopPlayback(false);
    ui.preferencesVolume.value = ui.volume.value;
    ui.preferencesVolumeOutput.textContent = `${ui.preferencesVolume.value}%`;
    ui.preferencesWaveform.value = ui.waveform.value;
    ui.preferencesRunMode.value = ui.runMode.value;
    setOutputStatus("Output follows the device selected in iPhone or iPad Control Center.");
    ui.preferencesDialog.hidden = false;
    ui.preferencesDialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("editor-open");
  }

  function closePreferencesDialog() {
    stopTestOutput();
    ui.preferencesDialog.hidden = true;
    ui.preferencesDialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("editor-open");
  }

  function savePreferencesFromDialog() {
    const next = normalizePreferences({
      volume: ui.preferencesVolume.value,
      waveform: ui.preferencesWaveform.value,
      runMode: ui.preferencesRunMode.value
    });
    if (!persistPreferences(next)) {
      setOutputStatus("These preferences could not be saved on this device.", "error");
      return;
    }
    applyPreferences(next);
    closePreferencesDialog();
    renderNow();
  }

  function resetPreferencesForm() {
    ui.preferencesVolume.value = String(DEFAULT_PREFERENCES.volume);
    ui.preferencesVolumeOutput.textContent = `${DEFAULT_PREFERENCES.volume}%`;
    ui.preferencesWaveform.value = DEFAULT_PREFERENCES.waveform;
    ui.preferencesRunMode.value = DEFAULT_PREFERENCES.runMode;
    setOutputStatus("Defaults are ready. Choose Save preferences to apply them.");
  }

  async function playOutputTest() {
    try {
      await ensureAudio();
      stopTestOutput();
      const ctx = state.audioContext;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const requestedVolume = Number(ui.preferencesVolume.value) / 100;
      const safeTestVolume = Math.max(0.02, Math.min(0.12, requestedVolume));
      oscillator.type = ui.preferencesWaveform.value;
      oscillator.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(safeTestVolume, ctx.currentTime + 0.03);
      gain.gain.setValueAtTime(safeTestVolume, ctx.currentTime + 0.75);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 1.02);
      state.testOutputNodes = [oscillator, gain];
      setOutputStatus("Playing a one-second 440 Hz test tone at a limited volume.");
      window.setTimeout(() => {
        stopTestOutput();
        if (!ui.preferencesDialog.hidden) setOutputStatus("Test complete. Use Control Center to change the audio output if needed.");
      }, 1150);
    } catch (_) {
      setOutputStatus("The audio test could not start. Check the selected iPhone or iPad output and try again.", "error");
    }
  }

  function showIOSAudioOutputHelp() {
    setOutputStatus("Swipe down from the top-right to open Control Center, tap the AirPlay audio icon, then choose speakers, headphones, or AirPods.");
  }

  function setEditorStatus(message, type = "") {
    ui.editorStatus.textContent = message;
    ui.editorStatus.className = type;
  }

  function renumberEditorRows() {
    ui.editorRows.querySelectorAll("tr").forEach((row, index) => {
      row.querySelector(".editor-row-number").textContent = String(index + 1);
      row.querySelectorAll("input").forEach((input) => {
        input.setAttribute("aria-label", `Tone ${index + 1} ${input.dataset.field}`);
      });
    });
  }

  function addEditorTone(tone = { frequency: 440, duration: 180, phase: 0, left: 100, right: 100 }) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="editor-row-number"></td>
      <td><input data-field="frequency" type="number" min="0" step="any"></td>
      <td><input data-field="duration" type="number" min="0.01" step="any"></td>
      <td><input data-field="phase" type="number" step="any"></td>
      <td><input data-field="left" type="number" min="0" max="100" step="any"></td>
      <td><input data-field="right" type="number" min="0" max="100" step="any"></td>
      <td><button class="remove-tone-button" type="button" aria-label="Remove tone">×</button></td>`;
    ["frequency", "duration", "phase", "left", "right"].forEach((field) => {
      row.querySelector(`[data-field="${field}"]`).value = formatNumber(Number(tone[field]));
    });
    row.querySelector(".remove-tone-button").addEventListener("click", () => {
      row.remove();
      renumberEditorRows();
      setEditorStatus("");
    });
    ui.editorRows.appendChild(row);
    renumberEditorRows();
  }

  function openEditor({ title = "", tones = [], customId = null, source = "", heading = "New frequency script" } = {}) {
    stopPlayback(false);
    editingCustomId = customId;
    editorSourceName = source;
    ui.editorHeading.textContent = heading;
    ui.scriptName.value = title;
    ui.editorRows.replaceChildren();
    (tones.length ? tones : [{ frequency: 440, duration: 180, phase: 0, left: 100, right: 100 }])
      .forEach((tone) => addEditorTone(tone));
    ui.deleteScript.hidden = !customId;
    setEditorStatus("");
    ui.editor.hidden = false;
    ui.editor.setAttribute("aria-hidden", "false");
    document.body.classList.add("editor-open");
    window.setTimeout(() => ui.scriptName.focus(), 0);
  }

  function closeEditor() {
    ui.editor.hidden = true;
    ui.editor.setAttribute("aria-hidden", "true");
    document.body.classList.remove("editor-open");
    setEditorStatus("");
  }

  function filenameFromTitle(title) {
    const safe = title.trim()
      .replace(/\.rts$/i, "")
      .replace(/[\\/:*?"<>|%]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "Custom_script";
    return `${safe}.rts`;
  }

  function collectEditorScript() {
    const title = ui.scriptName.value.trim();
    if (!title) throw new Error("Enter a script name.");
    const rows = [...ui.editorRows.querySelectorAll("tr")];
    if (!rows.length) throw new Error("Add at least one tone.");
    const tones = rows.map((row, index) => {
      const read = (field) => Number(row.querySelector(`[data-field="${field}"]`).value);
      const tone = {
        frequency: read("frequency"), duration: read("duration"), phase: read("phase"),
        left: read("left"), right: read("right")
      };
      if (!Number.isFinite(tone.frequency) || tone.frequency < 0) throw new Error(`Tone ${index + 1}: frequency must be 0 or higher.`);
      if (!Number.isFinite(tone.duration) || tone.duration <= 0) throw new Error(`Tone ${index + 1}: duration must be greater than 0.`);
      if (!Number.isFinite(tone.phase)) throw new Error(`Tone ${index + 1}: phase must be a number.`);
      if (!Number.isFinite(tone.left) || tone.left < 0 || tone.left > 100) throw new Error(`Tone ${index + 1}: left channel must be 0–100.`);
      if (!Number.isFinite(tone.right) || tone.right < 0 || tone.right > 100) throw new Error(`Tone ${index + 1}: right channel must be 0–100.`);
      return tone;
    });
    return { title, source: editorSourceName || filenameFromTitle(title), tones };
  }

  function serializeRTS(script) {
    const toneLines = script.tones.map((tone) => [
      "tone", formatNumber(tone.frequency), formatNumber(tone.duration), formatNumber(tone.phase),
      formatNumber(tone.left), formatNumber(tone.right)
    ].join(" "));
    return `${toneLines.join("\r\n")}\r\nend\r\n`;
  }

  function parseRTS(content, sourceName = "Imported_script.rts") {
    const title = sourceName.replace(/\.rts$/i, "").replace(/_/g, " ").trim() || "Imported script";
    const knownScript = libraryScripts.find((script) => script.source.toLocaleLowerCase() === sourceName.toLocaleLowerCase());
    try {
      const lines = String(content).split(/\r\n|\n|\r/);
      const tones = [];
      let foundEnd = false;
      lines.forEach((rawLine, index) => {
        if (foundEnd) return;
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) return;
        if (/^end$/i.test(line)) {
          foundEnd = true;
          return;
        }
        const parts = line.split(/\s+/);
        if (parts.length < 6 || parts[0].toLowerCase() !== "tone") {
          throw new Error(`Line ${index + 1} is not a valid original tone line.`);
        }
        const tone = normalizeStoredTone({
          frequency: parts[1].replace(/,$/, ""), duration: parts[2], phase: parts[3], left: parts[4], right: parts[5]
        });
        if (!tone) throw new Error(`Line ${index + 1} contains invalid tone values.`);
        tones.push(tone);
      });
      if (!tones.length) throw new Error("No valid tone lines were found.");
      if (!foundEnd) throw new Error("The original .rts ending line (end) is missing.");
      return { title, source: sourceName, tones };
    } catch (error) {
      if (!knownScript) throw error;
      return {
        title: knownScript.title,
        source: knownScript.source,
        tones: knownScript.tones.map((tone) => ({ ...tone })),
        recoveredOriginal: true
      };
    }
  }

  function saveRTSFile(script) {
    const filename = filenameFromTitle(script.title);
    const content = serializeRTS(script);
    const nativeHandler = window.webkit?.messageHandlers?.saveRTS;
    if (nativeHandler) {
      nativeHandler.postMessage({ filename, content });
      return;
    }
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function persistCustomScripts(nextScripts) {
    try {
      localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(nextScripts));
      return true;
    } catch (_) {
      return false;
    }
  }

  function newCustomId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function saveEditorToLibrary() {
    try {
      const draft = collectEditorScript();
      const nextScripts = customScripts.slice();
      let customIndex = nextScripts.findIndex((script) => script.id === editingCustomId);
      const saved = {
        ...draft,
        id: editingCustomId || newCustomId(),
        source: filenameFromTitle(draft.title),
        custom: true
      };
      if (customIndex >= 0) nextScripts[customIndex] = saved;
      else {
        nextScripts.push(saved);
        customIndex = nextScripts.length - 1;
      }
      if (!persistCustomScripts(nextScripts)) {
        throw new Error("This device could not store the custom script. Save an .rts file instead.");
      }
      customScripts = nextScripts;
      rebuildScripts();
      state.scriptIndex = libraryScripts.length + customIndex;
      state.stepIndex = 0;
      ui.search.value = "";
      closeEditor();
      renderLibrary();
      renderSequence();
    } catch (error) {
      setEditorStatus(error.message, "error");
    }
  }

  function removeCustomScript(customId, fromEditor = false) {
    if (!customId) return;
    const script = customScripts.find((item) => item.id === customId);
    if (!script || !window.confirm(`Delete the custom script “${script.title}”?`)) return;
    const nextScripts = customScripts.filter((item) => item.id !== customId);
    if (!persistCustomScripts(nextScripts)) {
      const message = "The custom script could not be deleted from this device.";
      if (fromEditor) setEditorStatus(message, "error");
      else window.alert(message);
      return;
    }
    customScripts = nextScripts;
    rebuildScripts();
    const nextSelection = state.showCustomOnly && customScripts.length
      ? customScripts[0]
      : libraryScripts.find((item) => item.title === "Wellness") || scripts[0];
    state.scriptIndex = Math.max(0, scripts.indexOf(nextSelection));
    state.stepIndex = 0;
    state.stepElapsed = 0;
    if (fromEditor) closeEditor();
    renderLibrary();
    renderSequence();
  }

  function deleteCustomScript() {
    removeCustomScript(editingCustomId, true);
  }

  function deleteSelectedCustomScript() {
    const script = currentScript();
    if (!script.custom) return;
    stopPlayback(false);
    removeCustomScript(script.id);
  }

  async function importScriptLibraryFile(file) {
    const replacingExistingLibrary = libraryScripts.length > 0;
    try {
      if (!replacingExistingLibrary) setLibraryGateStatus("Checking the selected library...");
      if (/\.zip$/i.test(file.name)) {
        throw new Error("Select the .riflibrary file, not the ZIP. In Files, tap the ZIP once to extract it, then choose “RIF Resonance Script Library.riflibrary”.");
      }
      const packageData = parseScriptLibrary(await readFileAsText(file));
      activateScriptLibrary(packageData);
    } catch (error) {
      if (replacingExistingLibrary) {
        window.alert(`The selected script library could not be loaded.\n\n${error.message}`);
      } else {
        setLibraryGateStatus(error.message, "error");
      }
    }
  }

  ui.loadLibrary.addEventListener("click", () => ui.libraryInput.click());
  ui.changeLibrary.addEventListener("click", () => ui.libraryInput.click());
  ui.libraryInput.addEventListener("change", async () => {
    const file = ui.libraryInput.files?.[0];
    ui.libraryInput.value = "";
    if (file) await importScriptLibraryFile(file);
  });
  ui.customScripts.addEventListener("click", () => {
    state.showCustomOnly = !state.showCustomOnly;
    ui.search.value = "";
    if (state.showCustomOnly && customScripts.length) {
      selectScript(scripts.indexOf(customScripts[0]));
    } else {
      renderLibrary();
    }
  });

  ui.preferences.addEventListener("click", openPreferencesDialog);
  ui.closePreferences.addEventListener("click", closePreferencesDialog);
  ui.cancelPreferences.addEventListener("click", closePreferencesDialog);
  ui.preferencesDialog.addEventListener("click", (event) => {
    if (event.target === ui.preferencesDialog) closePreferencesDialog();
  });
  ui.preferencesVolume.addEventListener("input", () => {
    ui.preferencesVolumeOutput.textContent = `${ui.preferencesVolume.value}%`;
  });
  ui.savePreferences.addEventListener("click", savePreferencesFromDialog);
  ui.resetPreferences.addEventListener("click", resetPreferencesForm);
  ui.testOutput.addEventListener("click", playOutputTest);
  ui.openSoundSettings.addEventListener("click", showIOSAudioOutputHelp);

  ui.play.addEventListener("click", () => {
    if (state.mode === "playing") pausePlayback();
    else beginTone();
  });
  ui.stop.addEventListener("click", () => stopPlayback(false));
  ui.previous.addEventListener("click", () => jumpToStep(Math.max(0, state.stepIndex - 1)));
  ui.next.addEventListener("click", () => jumpToStep(Math.min(currentScript().tones.length - 1, state.stepIndex + 1)));
  ui.search.addEventListener("input", renderLibrary);
  ui.volume.addEventListener("input", () => {
    ui.volumeOutput.textContent = `${ui.volume.value}%`;
    const master = state.sourceNodes[state.sourceNodes.length - 1];
    if (master?.gain && state.audioContext) master.gain.setTargetAtTime(Number(ui.volume.value) / 100, state.audioContext.currentTime, 0.02);
  });
  ui.volume.addEventListener("change", persistCurrentControls);
  ui.waveform.addEventListener("change", () => {
    persistCurrentControls();
    if (state.mode === "playing") beginTone();
  });
  ui.runMode.addEventListener("change", () => {
    persistCurrentControls();
    state.stepElapsed = 0;
    if (state.mode === "playing") beginTone();
    else renderNow();
  });

  ui.newScript.addEventListener("click", () => openEditor());
  ui.editScript.addEventListener("click", () => {
    const script = currentScript();
    openEditor({
      title: script.custom ? script.title : `${script.title} copy`,
      tones: script.tones,
      customId: script.custom ? script.id : null,
      source: script.custom ? script.source : "",
      heading: script.custom ? "Edit custom script" : "Edit or export a copy"
    });
  });
  ui.exportScript.addEventListener("click", () => saveRTSFile(currentScript()));
  ui.deleteSelectedScript.addEventListener("click", deleteSelectedCustomScript);
  ui.importScript.addEventListener("click", () => ui.importInput.click());
  ui.importInput.addEventListener("change", async () => {
    const file = ui.importInput.files?.[0];
    ui.importInput.value = "";
    if (!file) return;
    try {
      if (/\.zip$/i.test(file.name)) throw new Error("Extract the ZIP in Files, then select an individual .rts file.");
      const imported = parseRTS(await readFileAsText(file), file.name);
      openEditor({ ...imported, heading: "Import original .rts script" });
      const recoveryText = imported.recoveredOriginal ? " The corrected library version was used for malformed legacy lines." : "";
      setEditorStatus(`${imported.tones.length} tones imported.${recoveryText} Review and save to the library.`, "success");
    } catch (error) {
      window.alert(`This .rts file could not be imported.\n\n${error.message}`);
    }
  });

  ui.addTone.addEventListener("click", () => {
    addEditorTone();
    ui.editorRows.lastElementChild?.querySelector('[data-field="frequency"]')?.focus();
  });
  ui.closeEditor.addEventListener("click", closeEditor);
  ui.cancelEditor.addEventListener("click", closeEditor);
  ui.editor.addEventListener("click", (event) => {
    if (event.target === ui.editor) closeEditor();
  });
  ui.saveLibrary.addEventListener("click", saveEditorToLibrary);
  ui.deleteScript.addEventListener("click", deleteCustomScript);
  ui.saveRTS.addEventListener("click", () => {
    try {
      const script = collectEditorScript();
      saveRTSFile(script);
      setEditorStatus("The original-format .rts Save dialog is open.", "success");
    } catch (error) {
      setEditorStatus(error.message, "error");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ui.editor.hidden) {
      event.preventDefault();
      closeEditor();
      return;
    }
    if (event.key === "Escape" && !ui.preferencesDialog.hidden) {
      event.preventDefault();
      closePreferencesDialog();
      return;
    }
    if (!ui.editor.hidden || !ui.preferencesDialog.hidden) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      ui.search.focus();
    }
    const activeTag = document.activeElement?.tagName;
    if (event.code === "Space" && !["INPUT", "BUTTON", "SELECT"].includes(activeTag)) {
      event.preventDefault();
      ui.play.click();
    }
  });
  window.addEventListener("beforeunload", () => {
    stopAudioNodes();
    stopTestOutput();
  });

  window.RIF_SCRIPT_TOOLS = Object.freeze({ parseRTS, serializeRTS, filenameFromTitle, parseScriptLibrary });

  applyPreferences(preferences);
  updateLibraryAccess();
  if (libraryScripts.length) {
    renderLibrary();
    renderSequence();
  }
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => { /* online use still works */ });
    });
  }
})();

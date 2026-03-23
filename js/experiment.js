/**
 * 经典视觉搜索：特征搜索（颜色 pop-out）与联合搜索（颜色×朝向）
 * 静态托管，数据结束时下载至本地 CSV
 */
(function () {
  "use strict";

  const FIXATION_MS = 500;
  const STIM_MS = 3000;
  const FEEDBACK_MS = 800;
  const ITI_MIN_MS = 400;
  const ITI_MAX_MS = 800;
  const KEY_PRESENT = "j";
  const KEY_ABSENT = "f";
  const CANVAS_W = 720;
  const CANVAS_H = 520;
  const INNER_MARGIN = 48;
  const MIN_DIST = 44;
  const BAR_LEN = 36;
  const BAR_THICK = 7;
  const RED = "#c62828";
  const BLUE = "#1565c0";
  const BLOCKS = 3;
  const TRIALS_PER_BLOCK = 16;
  const PRACTICE_COUNT = 8;

  const mountEl = document.getElementById("jspsych-target");

  function showFatalError(message) {
    if (!mountEl) return;
    mountEl.innerHTML =
      "<div class=\"exp-wrap\"><h2>运行错误</h2><p>请截图发给研究者：</p><pre style=\"white-space:pre-wrap;color:#b71c1c;background:#fff3f3;padding:12px;border-radius:6px;\">" +
      String(message) +
      "</pre></div>";
  }

  window.addEventListener("error", function (e) {
    showFatalError(e.message || "未知脚本错误");
  });
  window.addEventListener("unhandledrejection", function (e) {
    const r = e.reason;
    showFatalError((r && (r.stack || r.message)) || String(r) || "未处理的 Promise");
  });

  if (typeof initJsPsych !== "function") {
    showFatalError("未加载 jsPsych，请检查 vendor/jspsych 是否完整。");
    return;
  }
  if (
    typeof jsPsychFullscreen === "undefined" ||
    typeof jsPsychHtmlKeyboardResponse === "undefined" ||
    typeof jsPsychHtmlButtonResponse === "undefined" ||
    typeof jsPsychSurveyHtmlForm === "undefined"
  ) {
    showFatalError("jsPsych 插件未完整加载。");
    return;
  }

  let participantId = "participant";
  let hasDownloaded = false;

  const jsPsych = initJsPsych({
    display_element: mountEl,
    on_finish: function () {
      if (!hasDownloaded) {
        downloadCsv(buildFullCsv(jsPsych), buildFilename());
        hasDownloaded = true;
      }
    }
  });

  window.addEventListener("keydown", function (e) {
    if (e.shiftKey && (e.code === "KeyE" || e.key === "E")) {
      jsPsych.endExperiment("实验已由研究者终止（Shift + E）。");
    }
  });

  function buildBlockTrials(blockIndex) {
    const cells = [];
    const setSizes = [8, 12, 16];
    const searches = ["feature", "conjunction"];
    for (const searchType of searches) {
      for (const setSize of setSizes) {
        for (const tp of [0, 1]) {
          cells.push({
            block: blockIndex,
            searchType,
            setSize,
            targetPresent: tp
          });
        }
      }
    }
    if (cells.length !== 12) throw new Error("internal: expected 12 factorial cells");
    const extra = jsPsych.randomization.shuffle(cells.slice()).slice(0, 4);
    return jsPsych.randomization.shuffle(cells.concat(extra));
  }

  function buildPracticeTrials() {
    const samples = [
      { searchType: "feature", setSize: 8, targetPresent: 1 },
      { searchType: "feature", setSize: 12, targetPresent: 0 },
      { searchType: "conjunction", setSize: 8, targetPresent: 1 },
      { searchType: "conjunction", setSize: 16, targetPresent: 0 },
      { searchType: "feature", setSize: 16, targetPresent: 1 },
      { searchType: "conjunction", setSize: 12, targetPresent: 0 },
      { searchType: "feature", setSize: 8, targetPresent: 0 },
      { searchType: "conjunction", setSize: 12, targetPresent: 1 }
    ];
    const shuffled = jsPsych.randomization.shuffle(
      samples.map(function (s) {
        return {
          block: 0,
          searchType: s.searchType,
          setSize: s.setSize,
          targetPresent: s.targetPresent,
          task: "practice_trial"
        };
      })
    );
    shuffled.forEach(function (t, i) {
      t.blockTrialN = i + 1;
      t.blockTrialTotal = PRACTICE_COUNT;
    });
    return shuffled;
  }

  function buildStimulusList(trialInfo) {
    const n = trialInfo.setSize;
    const st = trialInfo.searchType;
    const tp = trialInfo.targetPresent === 1;

    if (st === "feature") {
      if (tp) {
        const items = [{ ori: "v", color: BLUE }];
        for (let i = 0; i < n - 1; i++) items.push({ ori: "v", color: RED });
        return shuffle(items);
      }
      const items = [];
      for (let i = 0; i < n; i++) items.push({ ori: "v", color: RED });
      return shuffle(items);
    }

    if (st === "conjunction") {
      if (tp) {
        const items = [{ ori: "v", color: BLUE }];
        for (let k = 0; k < n - 1; k++) {
          if (Math.random() < 0.5) items.push({ ori: "v", color: RED });
          else items.push({ ori: "h", color: BLUE });
        }
        return shuffle(items);
      }
      if (n < 2) throw new Error("setSize must be >= 2 for conjunction absent");
      const items = [];
      let rv = 1 + Math.floor(Math.random() * (n - 1));
      let bh = n - rv;
      for (let i = 0; i < rv; i++) items.push({ ori: "v", color: RED });
      for (let j = 0; j < bh; j++) items.push({ ori: "h", color: BLUE });
      return shuffle(items);
    }
    throw new Error("unknown searchType");
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function samplePositions(n) {
    const w = CANVAS_W;
    const h = CANVAS_H;
    const m = INNER_MARGIN;

    function tryPlace(minD) {
      const out = [];
      const maxAttempts = 80;
      for (let i = 0; i < n; i++) {
        let placed = false;
        for (let attempt = 0; attempt < maxAttempts * n && !placed; attempt++) {
          const x = m + BAR_LEN + Math.random() * (w - 2 * m - 2 * BAR_LEN);
          const y = m + BAR_LEN + Math.random() * (h - 2 * m - 2 * BAR_LEN);
          if (out.every(function (p) {
            return Math.hypot(p.x - x, p.y - y) >= minD;
          })) {
            out.push({ x: x, y: y });
            placed = true;
          }
        }
        if (!placed) return null;
      }
      return out;
    }

    let minD = MIN_DIST;
    for (let round = 0; round < 12; round++) {
      const pos = tryPlace(minD);
      if (pos) return pos;
      minD *= 0.92;
    }
    return tryPlace(28) || [];
  }

  function drawBar(ctx, x, y, item) {
    const c = item.color === "blue" ? BLUE : RED;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = c;
    if (item.ori === "v") {
      ctx.fillRect(-BAR_THICK / 2, -BAR_LEN / 2, BAR_THICK, BAR_LEN);
    } else {
      ctx.fillRect(-BAR_LEN / 2, -BAR_THICK / 2, BAR_LEN, BAR_THICK);
    }
    ctx.restore();
  }

  function drawTrialStimuli(trialInfo) {
    const canvas = document.getElementById("stim-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const items = buildStimulusList(trialInfo);
    const positions = samplePositions(items.length);
    for (let i = 0; i < items.length; i++) {
      if (positions[i]) drawBar(ctx, positions[i].x, positions[i].y, items[i]);
    }
  }

  function appendOneTrial(targetTimeline, trialInfo) {
    let stimOnset = "";

    targetTimeline.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus: "<div class=\"center-screen\"><div class=\"fixation\">+</div></div>",
      choices: "NO_KEYS",
      trial_duration: FIXATION_MS,
      data: {
        phase: "fixation",
        task: trialInfo.task,
        block: trialInfo.block,
        searchType: trialInfo.searchType,
        setSize: trialInfo.setSize,
        targetPresent: trialInfo.targetPresent
      }
    });

    targetTimeline.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus: function () {
        return (
          "<div class=\"stim-wrap\">" +
          "<canvas id=\"stim-canvas\" width=\"" +
          CANVAS_W +
          "\" height=\"" +
          CANVAS_H +
          "\"></canvas>" +
          "<div class=\"trial-progress\">" +
          (trialInfo.task === "practice_trial"
            ? "练习"
            : "Block " + trialInfo.block + " / " + BLOCKS) +
          "：第 " +
          trialInfo.blockTrialN +
          " / " +
          trialInfo.blockTrialTotal +
          " 试次</div>" +
          "<div class=\"prompt-keys\">目标为<strong>蓝色竖条</strong>：存在按 <kbd>J</kbd> ，不存在按 <kbd>F</kbd></div>" +
          "</div>"
        );
      },
      choices: [KEY_ABSENT, KEY_PRESENT],
      trial_duration: STIM_MS,
      response_ends_trial: true,
      data: {
        phase: "stimulus",
        task: trialInfo.task,
        block: trialInfo.block,
        searchType: trialInfo.searchType,
        setSize: trialInfo.setSize,
        targetPresent: trialInfo.targetPresent
      },
      on_load: function () {
        drawTrialStimuli(trialInfo);
        stimOnset = new Date().toISOString();
      },
      on_finish: function (data) {
        const key = data.response;
        const shouldPresent = trialInfo.targetPresent === 1;
        const pressedPresent = key === KEY_PRESENT;
        const pressedAbsent = key === KEY_ABSENT;
        data.response_key = key || "";
        data.timeout = data.response === null;
        if (data.timeout) {
          data.correct = 0;
        } else if (shouldPresent) {
          data.correct = pressedPresent ? 1 : 0;
        } else {
          data.correct = pressedAbsent ? 1 : 0;
        }
        data.stimOnset = stimOnset;
        data.trialEnd = new Date().toISOString();
      }
    });

    targetTimeline.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus: function () {
        const d = jsPsych.data.get().last(1).values()[0];
        if (d.timeout) {
          return "<div class=\"center-screen\"><div class=\"feedback fb-slow\">太慢了</div></div>";
        }
        if (d.correct === 1) {
          return "<div class=\"center-screen\"><div class=\"feedback fb-correct\">正确</div></div>";
        }
        return "<div class=\"center-screen\"><div class=\"feedback fb-wrong\">错误</div></div>";
      },
      choices: "NO_KEYS",
      trial_duration: FEEDBACK_MS,
      data: {
        phase: "feedback",
        task: trialInfo.task,
        block: trialInfo.block
      }
    });

    targetTimeline.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus: "",
      choices: "NO_KEYS",
      trial_duration: jsPsych.randomization.randomInt(ITI_MIN_MS, ITI_MAX_MS + 1),
      data: {
        phase: "iti",
        task: trialInfo.task,
        block: trialInfo.block
      }
    });
  }

  function buildFullCsv(jsPsychInstance) {
    const vals = jsPsychInstance.data.get().filterCustom(function (trial) {
      return (
        (trial.task === "main_trial" || trial.task === "practice_trial") &&
        trial.phase === "stimulus"
      );
    }).values();
    return toCsv(
      vals.map(function (r, idx) {
        return {
          trial_index: idx + 1,
          participant: r.participant || "",
          age: r.age != null ? r.age : "",
          gender: r.gender || "",
          task: r.task || "",
          block: r.block,
          searchType: r.searchType || "",
          setSize: r.setSize,
          targetPresent: r.targetPresent,
          response: r.response_key || "",
          correct: r.correct,
          rt: r.rt != null ? Math.round(r.rt) : "",
          timeout: r.timeout ? 1 : 0,
          stimOnset: r.stimOnset || "",
          trialEnd: r.trialEnd || ""
        };
      })
    );
  }

  function toCsv(rows) {
    if (!rows.length) return "";
    const header = Object.keys(rows[0]);
    const body = rows.map(function (r) {
      return header
        .map(function (h) {
          const v = r[h] == null ? "" : String(r[h]);
          if (v.indexOf(",") >= 0 || v.indexOf("\"") >= 0 || v.indexOf("\n") >= 0) {
            return "\"" + v.replace(/"/g, "\"\"") + "\"";
          }
          return v;
        })
        .join(",");
    });
    return [header.join(",")].concat(body).join("\n");
  }

  function buildFilename() {
    const date = new Date().toISOString().slice(0, 10);
    return "visual_search_" + participantId + "_" + date + ".csv";
  }

  function downloadCsv(csvText, filename) {
    const blob = new Blob(["\ufeff" + csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const timeline = [];

  timeline.push({
    type: jsPsychFullscreen,
    fullscreen_mode: true,
    message: "<p>实验将进入全屏模式。</p><p>按按钮继续。</p>",
    button_label: "进入全屏"
  });

  timeline.push({
    type: jsPsychSurveyHtmlForm,
    preamble:
      "<div class=\"exp-wrap\"><h2>被试信息</h2><p>以下信息仅保存在本机下载的 CSV 中，不上传服务器。</p></div>",
    html:
      "<p><label>编号（participant）：<input name=\"participant\" required /></label></p>" +
      "<p><label>年龄：<input name=\"age\" type=\"number\" min=\"1\" max=\"120\" required /></label></p>" +
      "<p><label>性别：<select name=\"gender\" required>" +
      "<option value=\"\">请选择</option>" +
      "<option value=\"male\">男</option>" +
      "<option value=\"female\">女</option>" +
      "<option value=\"other\">其他</option>" +
      "</select></label></p>",
    button_label: "继续",
    on_finish: function (data) {
      let ans = {};
      if (data && typeof data.response === "object" && data.response !== null) {
        ans = data.response;
      } else if (data && typeof data.responses === "string") {
        try {
          ans = JSON.parse(data.responses);
        } catch (e) {
          ans = {};
        }
      }
      participantId = String(ans.participant || "participant");
      jsPsych.data.addProperties({
        participant: participantId,
        age: ans.age,
        gender: ans.gender,
        expName: "visual_search_static",
        userAgent: navigator.userAgent
      });
    }
  });

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus:
      "<div class=\"exp-wrap\">" +
      "<h2>视觉搜索实验</h2>" +
      "<p>屏幕上会呈现若干<strong>红色或蓝色的长条</strong>（竖或横）。</p>" +
      "<p><strong>目标刺激</strong>：<strong>蓝色竖条</strong>。</p>" +
      "<p><strong>特征搜索</strong>试次中，干扰物均为红色竖条；蓝色竖条在颜色上非常显眼。</p>" +
      "<p><strong>联合搜索</strong>试次中，干扰物为红色竖条与蓝色横条的混合；你必须同时注意颜色和朝向。</p>" +
      "<p>若你认为<strong>存在</strong>目标（蓝色竖条），请尽快按 <kbd>J</kbd>；若<strong>不存在</kbd>，请按 <kbd>F</kbd>。</p>" +
      "<p>首先进行 " +
      PRACTICE_COUNT +
      " 次练习，随后正式实验共 " +
      BLOCKS +
      " 个 block，每 block " +
      TRIALS_PER_BLOCK +
      " 试次。</p>" +
      "<p>请尽量又快又准。实验结束后数据将<strong>自动下载</strong>到本机。</p>" +
      "</div>",
    choices: ["开始练习"]
  });

  buildPracticeTrials().forEach(function (t) {
    appendOneTrial(timeline, t);
  });

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: "<div class=\"exp-wrap\"><h3>练习结束</h3><p>接下来进入正式实验。</p></div>",
    choices: ["开始正式实验"]
  });

  for (let b = 1; b <= BLOCKS; b++) {
    const blockTrials = buildBlockTrials(b);
    blockTrials.forEach(function (trial, idx) {
      appendOneTrial(timeline, {
        block: b,
        searchType: trial.searchType,
        setSize: trial.setSize,
        targetPresent: trial.targetPresent,
        blockTrialN: idx + 1,
        blockTrialTotal: TRIALS_PER_BLOCK,
        task: "main_trial"
      });
    });

    if (b < BLOCKS) {
      timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus:
          "<div class=\"exp-wrap\"><h3>休息</h3><p>你已完成第 " +
          b +
          " / " +
          BLOCKS +
          " 个 block。请休息 1–2 分钟后继续。</p></div>",
        choices: ["继续下一区块"]
      });
    }
  }

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus:
      "<div class=\"exp-wrap\"><h2>实验结束</h2>" +
      "<p>感谢参与！数据应已自动下载为 CSV（UTF-8）。若被浏览器拦截，请点击下方按钮再次保存。</p>" +
      "</div>",
    choices: ["再次下载数据"],
    on_finish: function () {
      downloadCsv(buildFullCsv(jsPsych), buildFilename());
      hasDownloaded = true;
    }
  });

  timeline.push({
    type: jsPsychFullscreen,
    fullscreen_mode: false
  });

  jsPsych.run(timeline);
})();

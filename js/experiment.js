/**
 * 视觉搜索（实验结构见 doc/实验结构.md）
 * 5×5 固定网格交叉点呈现 T（网格线不画）；无刺激的交叉点留空。
 * 目标：红色正立 T；仅出现时按空格。
 */
(function () {
  "use strict";

  const FIXATION_MS = 500;
  const STIM_MS = 2000;
  const FEEDBACK_MS = 800;
  const ITI_MIN_MS = 400;
  const ITI_MAX_MS = 800;
  const TARGET_KEY = " ";
  const GRID_COLS = 5;
  const GRID_ROWS = 5;
  const CANVAS_W = 720;
  const CANVAS_H = 520;
  const T_SIZE = 40;
  const RED = "#d62828";
  const BLUE = "#1d4ed8";
  const STIM_LIB = window.VisualSearchStimulate || {};
  const BLOCKS = Number.isInteger(STIM_LIB.blocks) ? STIM_LIB.blocks : 3;
  const TRIALS_PER_BLOCK = Number.isInteger(STIM_LIB.trialsPerBlock) ? STIM_LIB.trialsPerBlock : 40;
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

  /** 25 个交叉点中心（网格线不绘制） */
  function generateGridCenters(width, height) {
    const marginX = 60;
    const marginY = 50;
    const cellW = (width - marginX * 2) / GRID_COLS;
    const cellH = (height - marginY * 2) / GRID_ROWS;
    const all = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        all.push({
          x: marginX + (c + 0.5) * cellW,
          y: marginY + (r + 0.5) * cellH
        });
      }
    }
    return all;
  }

  const GRID_CENTERS = generateGridCenters(CANVAS_W, CANVAS_H);

  function buildBlockTrials(blockIndex) {
    if (typeof STIM_LIB.buildBlockTrials === "function") {
      return STIM_LIB.buildBlockTrials(blockIndex);
    }
    throw new Error("缺少刺激集生成器：请检查 js/Stimulate.js 是否已加载。");
  }

  function buildPracticeTrials() {
    const samples = [
      { setSize: 5, targetPresent: 1 },
      { setSize: 5, targetPresent: 0 },
      { setSize: 10, targetPresent: 1 },
      { setSize: 10, targetPresent: 0 },
      { setSize: 15, targetPresent: 1 },
      { setSize: 15, targetPresent: 0 },
      { setSize: 20, targetPresent: 1 },
      { setSize: 20, targetPresent: 0 }
    ];
    const shuffled = jsPsych.randomization.shuffle(
      samples.map(function (s) {
        return {
          block: 0,
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

  /**
   * 生成 setSize 个刺激类型；目标为红色正立 T 时恰有一个 red+upright。
   * 干扰项禁止出现红色正立 T。
   */
  function generateStimTypes(setSize, targetPresent) {
    const arr = [];
    if (targetPresent === 1) {
      arr.push({ color: "red", inverted: false });
    }
    while (arr.length < setSize) {
      const inverted = Math.random() < 0.5;
      let color = Math.random() < 0.5 ? "red" : "blue";
      if (!inverted && color === "red") {
        color = "blue";
      }
      arr.push({ color: color, inverted: inverted });
    }
    return shuffle(arr);
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

  /** 从 25 个网格点中随机选 setSize 个，其余交叉点不呈现任何刺激 */
  function pickGridIndices(setSize) {
    const idx = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    return idx.slice(0, setSize);
  }

  function drawT(ctx, x, y, size, color, inverted) {
    const main = color === "red" ? RED : BLUE;
    ctx.save();
    ctx.translate(x, y);
    if (inverted) ctx.rotate(Math.PI);
    ctx.fillStyle = main;
    ctx.strokeStyle = main;
    ctx.lineWidth = 3;

    const topW = size;
    const topH = size * 0.22;
    const stemW = size * 0.24;
    const stemH = size * 0.78;

    ctx.fillRect(-topW / 2, -size / 2, topW, topH);
    ctx.fillRect(-stemW / 2, -size / 2 + topH, stemW, stemH);
    ctx.strokeRect(-topW / 2, -size / 2, topW, topH);
    ctx.strokeRect(-stemW / 2, -size / 2 + topH, stemW, stemH);
    ctx.restore();
  }

  function drawTrialStimuli(trialInfo) {
    const canvas = document.getElementById("stim-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const n = trialInfo.setSize;
    const indices = pickGridIndices(n);
    const types = generateStimTypes(n, trialInfo.targetPresent);
    for (let i = 0; i < n; i++) {
      const g = GRID_CENTERS[indices[i]];
      drawT(ctx, g.x, g.y, T_SIZE, types[i].color, types[i].inverted);
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
          "<div class=\"prompt-keys\">仅当出现<strong>红色正立 T</strong>时按<strong>空格</strong>；否则不要按键。</div>" +
          "</div>"
        );
      },
      choices: [TARGET_KEY],
      trial_duration: STIM_MS,
      response_ends_trial: true,
      data: {
        phase: "stimulus",
        task: trialInfo.task,
        block: trialInfo.block,
        setSize: trialInfo.setSize,
        targetPresent: trialInfo.targetPresent
      },
      on_load: function () {
        drawTrialStimuli(trialInfo);
        stimOnset = new Date().toISOString();
      },
      on_finish: function (data) {
        const pressed = data.response === TARGET_KEY;
        const shouldPress = trialInfo.targetPresent === 1;
        data.response_key = pressed ? "space" : "";
        data.timeout = data.response === null;
        if (shouldPress) {
          data.correct = pressed ? 1 : 0;
        } else {
          data.correct = pressed ? 0 : 1;
        }
        data.stimOnset = stimOnset;
        data.trialEnd = new Date().toISOString();
      }
    });

    targetTimeline.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus: function () {
        const d = jsPsych.data.get().last(1).values()[0];
        if (trialInfo.targetPresent === 1 && d.timeout) {
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
        expName: "visual_search_grid",
        userAgent: navigator.userAgent
      });
    }
  });

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus:
      "<div class=\"exp-wrap\">" +
      "<h2>视觉搜索实验</h2>" +
      "<p>刺激呈现在<strong>固定的 5×5 网格交叉点</strong>上（不显示网格线）；没有字母的交叉点保持空白。</p>" +
      "<p>每次会呈现若干 <strong>T</strong>，颜色与朝向可能为：红色正立、红色倒立、蓝色正立、蓝色倒立。</p>" +
      "<p><strong>规则</strong>：仅当出现<strong>红色正立 T</strong>时尽快按<strong>空格键</strong>；若没有出现红色正立 T（包括只有红倒立、蓝正立、蓝倒立），则<strong>不要按键</strong>。</p>" +
      "<p>刺激呈现至你按键或 " +
      STIM_MS / 1000 +
      " 秒。首先 " +
      PRACTICE_COUNT +
      " 次练习，然后正式实验 " +
      BLOCKS +
      " 个 block，每 block " +
      TRIALS_PER_BLOCK +
      " 试次（共 " +
      BLOCKS * TRIALS_PER_BLOCK +
      " 试次）。</p>" +
      "<p>实验结束后数据将<strong>自动下载</strong>到本机。</p>" +
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

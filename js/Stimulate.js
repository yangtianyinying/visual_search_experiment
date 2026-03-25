/**
 * 刺激集定义与生成（正式实验）
 * 每个 block: 4 个刺激水平 × 有无红色正立T × 每组合 5 次 = 40 trial
 * 共 3 个 block = 120 trial
 */
(function () {
  "use strict";

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

  function buildBlockTrials(blockIndex) {
    const setSizes = [5, 10, 15, 20];
    const perConditionRepeat = 5;
    const trials = [];
    for (let si = 0; si < setSizes.length; si++) {
      for (const targetPresent of [0, 1]) {
        for (let rep = 0; rep < perConditionRepeat; rep++) {
          trials.push({
            block: blockIndex,
            setSize: setSizes[si],
            targetPresent: targetPresent
          });
        }
      }
    }
    return shuffle(trials);
  }

  window.VisualSearchStimulate = {
    setSizes: [5, 10, 15, 20],
    perConditionRepeat: 5,
    blocks: 3,
    trialsPerBlock: 4 * 2 * 5,
    buildBlockTrials: buildBlockTrials
  };
})();

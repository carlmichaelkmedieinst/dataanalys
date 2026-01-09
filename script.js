// script.js (refactored + orchestration Q6 + dynamic max + adjusted thresholds)
(() => {
  // ----------------------------
  // Helpers
  // ----------------------------
  const $ = (sel) => document.querySelector(sel);

  window.dataLayer = window.dataLayer || [];
  const QUIZ_ID = "ma_stack_quiz_v1";

  function dlPush(event, params = {}) {
    const payload = {
      event,
      ...params,
      quiz_id: QUIZ_ID,
      page_path: location.pathname,
      page_title: document.title,
      ts: Date.now(),
    };
    window.dataLayer.push(payload);
    console.log("[dataLayer.push]", payload);
  }

  function pct(n, max) {
    if (!max || max <= 0) return 0;
    return Math.round((n / max) * 100);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function scoreBucketPercent(p) {
    // Percent-based buckets: stable even if you change weights
    // 0–24 low, 25–49 medium, 50–74 high, 75–100 very_high
    if (p >= 75) return "very_high";
    if (p >= 50) return "high";
    if (p >= 25) return "medium";
    return "low";
  }

  function getReturningHint() {
    const last = localStorage.getItem("ma_quiz_last_completed_at");
    if (!last) return "new";
    const delta = Date.now() - Number(last);
    if (delta < 24 * 60 * 60 * 1000) return "returning_1d";
    if (delta < 7 * 24 * 60 * 60 * 1000) return "returning_7d";
    return "returning_30d_plus";
  }

  // ----------------------------
  // Quiz definition
  // ----------------------------
  const QUESTIONS = [
    {
      id: "org_size",
      dimension: "organisation",
      title: "Hur ser er organisation ut idag?",
      help: "Storlek säger mycket om komplexitet och behov av struktur.",
      answers: [
        { id: "1_10", text: "1–10 anställda", score: { complexity: 0, data: 0, sales: 0 } },
        { id: "11_50", text: "11–50", score: { complexity: 1, data: 0, sales: 0 } },
        { id: "51_200", text: "51–200", score: { complexity: 2, data: 1, sales: 1 } },
        { id: "200_plus", text: "200+", score: { complexity: 3, data: 2, sales: 1 } },
      ],
    },
    {
      id: "sales_model",
      dimension: "go_to_market",
      title: "Hur genereras affärer främst?",
      help: "Olika säljmodell kräver olika typ av automation och integrationer.",
      answers: [
        { id: "inbound", text: "Inbound (content, forms)", score: { complexity: 1, data: 1, sales: 0 } },
        { id: "sales_driven", text: "Sales-drivet (SDR/AE)", score: { complexity: 2, data: 1, sales: 3 } },
        { id: "ecom", text: "E-commerce", score: { complexity: 2, data: 2, sales: 0 } },
        { id: "partners", text: "Partners / återförsäljare", score: { complexity: 2, data: 1, sales: 2 } },
      ],
    },
    {
      id: "crm_state",
      dimension: "crm_data",
      title: "Vilket påstående stämmer bäst om ert CRM?",
      help: "MA utan CRM/datadisciplin blir snabbt en dyr e-postmaskin.",
      answers: [
        { id: "no_crm", text: "Vi har inget CRM", score: { complexity: 0, data: 0, sales: 0 } },
        { id: "crm_weak", text: "Vi har CRM men använder det dåligt", score: { complexity: 1, data: 1, sales: 1 } },
        { id: "crm_central", text: "CRM är centralt i sälj", score: { complexity: 2, data: 2, sales: 2 } },
        { id: "crm_data_driven", text: "CRM + data driver beslut", score: { complexity: 3, data: 3, sales: 2 } },
      ],
    },
    {
      id: "data_quality",
      dimension: "data_maturity",
      title: "Hur bra koll har ni på datakvalitet?",
      help: "Datakvalitet avgör om personalisering och scoring blir magi eller kaos.",
      answers: [
        { id: "messy", text: "Ganska rörigt (dubbletter, saknade fält)", score: { complexity: 1, data: 0, sales: 1 } },
        { id: "ok", text: "Okej men inte konsekvent", score: { complexity: 1, data: 1, sales: 1 } },
        { id: "structured", text: "Strukturerat med tydliga fält/regler", score: { complexity: 2, data: 2, sales: 1 } },
        { id: "governed", text: "Governance + ägarskap + löpande städning", score: { complexity: 3, data: 3, sales: 1 } },
      ],
    },
    {
      id: "content_state",
      dimension: "content",
      title: "Vilket beskriver ert content bäst?",
      help: "MA behöver bränsle. Utan content blir flöden snabbt tomma.",
      answers: [
        { id: "adhoc", text: "Ad hoc / kampanjbaserat", score: { complexity: 0, data: 0, sales: 1 } },
        { id: "regular", text: "Regelbundet men utan tydlig funnel", score: { complexity: 1, data: 1, sales: 1 } },
        { id: "funnel", text: "Tydlig funnel per målgrupp", score: { complexity: 2, data: 2, sales: 1 } },
        { id: "revenue", text: "Systematiskt kopplat till revenue", score: { complexity: 3, data: 3, sales: 1 } },
      ],
    },

    // ✅ Replaced Q6 with orchestration (more specific + stronger signal)
    {
      id: "orchestration",
      dimension: "orchestration",
      title: "Hur arbetar ni med samordning mellan kanaler idag?",
      help: "Marketing Automation skalar först när kanaler hänger ihop – inte bara existerar parallellt.",
      answers: [
        {
          id: "isolated",
          text: "Kanaler används isolerat (e-post/webb/ads lever sina egna liv)",
          score: { complexity: 0, data: 0, sales: 0 },
        },
        {
          id: "manual_coordination",
          text: "Viss samordning manuellt (samma kampanj i flera kanaler, utan gemensam logik)",
          score: { complexity: 1, data: 1, sales: 0 },
        },
        {
          id: "flow_based",
          text: "Samordnade flöden (triggers i en kanal påverkar andra, t.ex. webb → e-post → sälj)",
          // data väger tyngre: orkestrering kräver datamognad
          score: { complexity: 2, data: 3, sales: 1 },
        },
        {
          id: "orchestrated_data_driven",
          text: "Orkestrerad, datadriven multikanal (segment/lifecycle styr upplevelsen)",
          score: { complexity: 3, data: 4, sales: 1 },
        },
      ],
    },

    {
      id: "integration_need",
      dimension: "integrations",
      title: "Hur mycket behöver ni integrera?",
      help: "Integrationer är ofta skillnaden mellan 'verktyg' och 'system'.",
      answers: [
        { id: "minimal", text: "Minimalt (få system)", score: { complexity: 0, data: 0, sales: 0 } },
        { id: "some", text: "Några system (CRM + webb + e-post)", score: { complexity: 1, data: 1, sales: 1 } },
        { id: "many", text: "Flera (CRM, support, billing, BI)", score: { complexity: 2, data: 2, sales: 2 } },
        { id: "enterprise", text: "Enterprise-landskap med ägarskap/IT", score: { complexity: 3, data: 3, sales: 2 } },
      ],
    },
    {
      id: "growth_goal",
      dimension: "goals",
      title: "Vad är ert fokus kommande 12 månader?",
      help: "Målet styr om du behöver ett lätt verktyg eller en hel RevOps-maskin.",
      answers: [
        { id: "order", text: "Struktur & ordning", score: { complexity: 1, data: 1, sales: 1 } },
        { id: "more_leads", text: "Öka leads", score: { complexity: 1, data: 1, sales: 0 } },
        { id: "more_conv", text: "Öka conversion", score: { complexity: 2, data: 2, sales: 1 } },
        { id: "scale", text: "Skala internationellt", score: { complexity: 3, data: 3, sales: 1 } },
      ],
    },
    {
      id: "budget_band",
      dimension: "resources",
      title: "Hur ser budget/kapacitet för verktyg ut?",
      help: "Brutalt: enterprise-stack utan budget blir bara skuld.",
      answers: [
        { id: "low", text: "Låg (vill hålla det enkelt)", score: { complexity: 0, data: 0, sales: 0 } },
        { id: "mid", text: "Medel (kan investera om det ger effekt)", score: { complexity: 1, data: 1, sales: 1 } },
        { id: "high", text: "Hög (verktyg + implementation)", score: { complexity: 2, data: 2, sales: 1 } },
        { id: "very_high", text: "Väldigt hög (team + ekosystem)", score: { complexity: 3, data: 3, sales: 2 } },
      ],
    },
    {
      id: "ops_owner",
      dimension: "ownership",
      title: "Vem äger Marketing Ops i praktiken?",
      help: "Ägarskap avgör hur avancerat du kan bygga utan att det faller ihop.",
      answers: [
        { id: "no_owner", text: "Ingen (det är lite allas ansvar)", score: { complexity: 1, data: 0, sales: 1 } },
        { id: "marketer", text: "Marknad (1–2 personer)", score: { complexity: 1, data: 1, sales: 1 } },
        { id: "revops", text: "RevOps/Marketing Ops-roll", score: { complexity: 2, data: 2, sales: 2 } },
        { id: "team", text: "Team med processer + governance", score: { complexity: 3, data: 3, sales: 2 } },
      ],
    },
  ];

  // ----------------------------
  // Dynamic max scores (future-proof)
  // ----------------------------
  function maxScoreFor(axis) {
    return QUESTIONS.reduce((sum, q) => {
      const max = Math.max(...q.answers.map(a => (a.score?.[axis] ?? 0)));
      return sum + max;
    }, 0);
  }

  const MAX = {
    complexity: maxScoreFor("complexity"),
    data: maxScoreFor("data"),
    sales: maxScoreFor("sales"),
  };
  MAX.total = MAX.complexity + MAX.data + MAX.sales;

  // ----------------------------
  // Stack mapping (thresholds adjusted & normalized)
  // ----------------------------
  const STACKS = [
    { key: "starter", title: "Starter stack" },
    { key: "growth_hubspot", title: "Growth stack (HubSpot)" },
    { key: "scale_revops", title: "Scale stack (RevOps)" },
    { key: "enterprise_light", title: "Enterprise-light stack" },
  ];

  function computeScores(answers) {
    const scores = { complexity: 0, data: 0, sales: 0 };
    for (const q of QUESTIONS) {
      const aid = answers[q.id];
      const ans = q.answers.find(a => a.id === aid);
      if (!ans) continue;
      scores.complexity += ans.score.complexity;
      scores.data += ans.score.data;
      scores.sales += ans.score.sales;
    }
    return scores;
  }

  function pickStack(scores) {
    // Normalize to percentages, so changes in weights don't break distribution.
    const total = scores.complexity + scores.data + scores.sales;

    const pTotal = pct(total, MAX.total);
    const pC = pct(scores.complexity, MAX.complexity);
    const pD = pct(scores.data, MAX.data);
    const pS = pct(scores.sales, MAX.sales);

    // Adjusted thresholds:
    // - Enterprise: very high total + high complexity + high data
    // - Scale: high total OR high sales + decent data
    // - Growth: medium+ total + decent data
    // - Starter: everything else
    //
    // These are tuned to avoid "too many Scale/Enterprise" after making data heavier on orchestration.
    if (pTotal >= 78 && pC >= 70 && pD >= 70) return STACKS.find(x => x.key === "enterprise_light");
    if (pTotal >= 60 || (pS >= 70 && pD >= 45)) return STACKS.find(x => x.key === "scale_revops");
    if (pTotal >= 40 && pD >= 30) return STACKS.find(x => x.key === "growth_hubspot");
    return STACKS.find(x => x.key === "starter");
  }

  // ----------------------------
  // State
  // ----------------------------
  const state = {
    started_at: null,
    current_index: 0,
    answers: {},               // { question_id: answer_id }
    per_question_time_ms: {},  // { question_id: ms }
    question_enter_at: null,
  };

  // ----------------------------
  // DOM refs
  // ----------------------------
  const screenIntro = $("#screen-intro");
  const screenQuiz = $("#screen-quiz");
  const screenResult = $("#screen-result");

  const btnStart = $("#btn-start");
  const btnDemoFill = $("#btn-demo-fill");
  const btnBack = $("#btn-back");
  const btnNext = $("#btn-next");

  const qTag = $("#q-tag");
  const qTitle = $("#q-title");
  const qHelp = $("#q-help");
  const answersEl = $("#answers");

  const progressBar = $("#progress-bar");
  const progressText = $("#progress-text");
  const stateHint = $("#state-hint");

  const resultTitle = $("#result-title");
  const resultSummary = $("#result-summary");
  const btnCTA = $("#btn-cta");
  const btnRestart = $("#btn-restart");
  const debugEl = $("#debug");

  const mComplexity = $("#m-complexity");
  const mData = $("#m-data");
  const mSales = $("#m-sales");
  const mComplexityNote = $("#m-complexity-note");
  const mDataNote = $("#m-data-note");
  const mSalesNote = $("#m-sales-note");

  // ----------------------------
  // UI helpers
  // ----------------------------
  function showScreen(which) {
    screenIntro.classList.add("hidden");
    screenQuiz.classList.add("hidden");
    screenResult.classList.add("hidden");
    which.classList.remove("hidden");
  }

  function renderQuestion() {
    const idx = state.current_index;
    const q = QUESTIONS[idx];

    state.question_enter_at = Date.now();

    qTag.textContent = `Dimension: ${q.dimension}`;
    qTitle.textContent = q.title;
    qHelp.textContent = q.help;

    const total = QUESTIONS.length;
    const current = idx + 1;
    progressText.textContent = `Fråga ${current} av ${total}`;
    const progressPct = Math.round((idx / total) * 100);
    progressBar.style.width = `${progressPct}%`;
    $(".progress")?.setAttribute("aria-valuenow", String(current));

    answersEl.innerHTML = "";
    const selectedId = state.answers[q.id];

    q.answers.forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "answer" + (a.id === selectedId ? " selected" : "");
      btn.dataset.questionId = q.id;
      btn.dataset.answerId = a.id;
      btn.textContent = a.text;
      btn.addEventListener("click", onSelectAnswer);
      answersEl.appendChild(btn);
    });

    btnBack.disabled = idx === 0;
    btnNext.disabled = !selectedId;
    stateHint.textContent = selectedId ? "Bra. Nästa." : "Välj ett svar för att gå vidare.";

    dlPush("ma_quiz_question_view", {
      question_id: q.id,
      question_index: current,
      question_count: total,
      dimension: q.dimension,
      has_previous_answer: Boolean(selectedId),
      returning_user_hint: getReturningHint(),
    });
  }

  function onSelectAnswer(e) {
    const btn = e.currentTarget;
    const qid = btn.dataset.questionId;
    const aid = btn.dataset.answerId;

    const idx = state.current_index;
    const q = QUESTIONS[idx];

    const t = Date.now() - (state.question_enter_at || Date.now());
    state.per_question_time_ms[qid] = (state.per_question_time_ms[qid] || 0) + t;
    state.question_enter_at = Date.now();

    state.answers[qid] = aid;

    [...answersEl.querySelectorAll(".answer")].forEach((b) => {
      b.classList.toggle("selected", b.dataset.answerId === aid);
    });

    btnNext.disabled = false;
    stateHint.textContent = "Bra. Nästa.";

    dlPush("ma_quiz_answer_select", {
      question_id: qid,
      question_index: idx + 1,
      dimension: q.dimension,
      answer_id: aid,
      answer_text: btn.textContent, // OK i dataLayer, men registrera inte som GA4 custom dimension
      time_spent_ms: t,
    });
  }

  function closeQuestionTime() {
    const q = QUESTIONS[state.current_index];
    const t = Date.now() - (state.question_enter_at || Date.now());
    state.per_question_time_ms[q.id] = (state.per_question_time_ms[q.id] || 0) + t;
  }

  function nextQuestion() {
    const q = QUESTIONS[state.current_index];
    if (!state.answers[q.id]) return;

    closeQuestionTime();

    if (state.current_index < QUESTIONS.length - 1) {
      state.current_index += 1;
      renderQuestion();
    } else {
      showResult();
    }
  }

  function prevQuestion() {
    if (state.current_index === 0) return;

    closeQuestionTime();
    state.current_index -= 1;

    dlPush("ma_quiz_back", {
      to_question_index: state.current_index + 1,
    });

    renderQuestion();
  }

  function showResult() {
    showScreen(screenResult);
    progressBar.style.width = `100%`;

    const scores = computeScores(state.answers);
    const chosen = pickStack(scores);

    const duration_ms = Date.now() - (state.started_at || Date.now());

    const pC = pct(scores.complexity, MAX.complexity);
    const pD = pct(scores.data, MAX.data);
    const pS = pct(scores.sales, MAX.sales);

    const complexity_bucket = scoreBucketPercent(pC);
    const data_bucket = scoreBucketPercent(pD);
    const sales_bucket = scoreBucketPercent(pS);

    resultTitle.textContent = chosen.title;
    resultSummary.textContent =
      "Din rekommendation baseras på komplexitet, datamognad och säljberoende. Klicka vidare för en landing page per stack.";

    mComplexity.textContent = complexity_bucket;
    mData.textContent = data_bucket;
    mSales.textContent = sales_bucket;

    // ✅ Dynamic maxes (no more /30 lies)
    mComplexityNote.textContent = `Poäng: ${scores.complexity} / ${MAX.complexity} (${pC}%)`;
    mDataNote.textContent = `Poäng: ${scores.data} / ${MAX.data} (${pD}%)`;
    mSalesNote.textContent = `Poäng: ${scores.sales} / ${MAX.sales} (${pS}%)`;

    // persist (non-PII)
    localStorage.setItem("ma_quiz_last_result", chosen.key);
    localStorage.setItem("ma_quiz_last_completed_at", String(Date.now()));

    const debug = {
      quiz_id: QUIZ_ID,
      started_at: state.started_at,
      duration_ms,
      max: MAX,
      scores,
      percents: { complexity_percent: pC, data_percent: pD, sales_percent: pS },
      buckets: { complexity_bucket, data_bucket, sales_bucket },
      result_stack: chosen.key,
      answers: state.answers,
      per_question_time_ms: state.per_question_time_ms,
      returning_user_hint: getReturningHint(),
    };
    debugEl.textContent = JSON.stringify(debug, null, 2);

    dlPush("ma_quiz_complete", {
      duration_ms,
      answers_count: Object.keys(state.answers).length,
      result_stack: chosen.key,
      complexity_score: scores.complexity,
      data_score: scores.data,
      sales_score: scores.sales,
      complexity_percent: pC,
      data_percent: pD,
      sales_percent: pS,
      complexity_bucket,
      data_bucket,
      sales_bucket,
      returning_user_hint: getReturningHint(),
    });
// Persist last quiz payload for setup landing (non-PII)
try {
  localStorage.setItem("ma_quiz_last_payload", JSON.stringify(debug));
} catch (e) {
  // ignore storage errors
}

    btnCTA.dataset.resultStack = chosen.key;
  }

  function startQuiz({ demo_fill = false } = {}) {
    state.started_at = Date.now();
    state.current_index = 0;
    state.answers = {};
    state.per_question_time_ms = {};
    state.question_enter_at = null;

    showScreen(screenQuiz);

    dlPush("ma_quiz_start", {
      demo_fill,
      returning_user_hint: getReturningHint(),
      question_count: QUESTIONS.length,
    });

    if (demo_fill) {
      for (const q of QUESTIONS) {
        const pick = q.answers[Math.floor(Math.random() * q.answers.length)];
        state.answers[q.id] = pick.id;
      }
      showResult();
      return;
    }

    renderQuestion();
  }

  function restart() {
    dlPush("ma_quiz_restart", { returning_user_hint: getReturningHint() });
    showScreen(screenIntro);
  }

  function onCTA() {
    const result_stack =
      btnCTA.dataset.resultStack ||
      localStorage.getItem("ma_quiz_last_result") ||
      "starter";

    dlPush("ma_quiz_result_cta_click", {
      cta_type: "recommended_setup",
      result_stack,
    });

    window.location.href = `setup.html?stack=${encodeURIComponent(result_stack)}`;
  }

  // ----------------------------
  // Wire up
  // ----------------------------
  btnStart.addEventListener("click", () => startQuiz({ demo_fill: false }));
  btnDemoFill.addEventListener("click", () => startQuiz({ demo_fill: true }));
  btnNext.addEventListener("click", nextQuestion);
  btnBack.addEventListener("click", prevQuestion);
  btnRestart.addEventListener("click", restart);
  btnCTA.addEventListener("click", onCTA);

  showScreen(screenIntro);

  dlPush("ma_page_view", {
    returning_user_hint: getReturningHint(),
  });
})();

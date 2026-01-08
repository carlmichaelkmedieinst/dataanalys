// script.js
(() => {
  // ----------------------------
  // 0) Helpers
  // ----------------------------
  const $ = (sel) => document.querySelector(sel);

  // dataLayer helper (för GTM/GA4)
  window.dataLayer = window.dataLayer || [];
  function dlPush(event, params = {}) {
    const payload = {
      event,
      ...params,
      ts: Date.now(),
      page_path: location.pathname,
    };
    window.dataLayer.push(payload);
    // Debug: du kan kommentera bort när du kopplar GTM på riktigt
    console.log("[dataLayer.push]", payload);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function bucketize(n, buckets) {
    // buckets: array av {min,max,label}
    for (const b of buckets) {
      if (n >= b.min && n <= b.max) return b.label;
    }
    return "unknown";
  }

  // ----------------------------
  // 1) Quiz definition
  // - Varje svar ger poäng i: complexity, data, sales
  // ----------------------------
  const QUESTIONS = [
    {
      id: "org_size",
      dimension: "Organisation",
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
      dimension: "Go-to-market",
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
      dimension: "CRM & data",
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
      dimension: "Datamognad",
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
      dimension: "Content",
      title: "Vilket beskriver ert content bäst?",
      help: "MA behöver bränsle. Utan content blir flöden snabbt tomma.",
      answers: [
        { id: "adhoc", text: "Ad hoc / kampanjbaserat", score: { complexity: 0, data: 0, sales: 1 } },
        { id: "regular", text: "Regelbundet men utan tydlig funnel", score: { complexity: 1, data: 1, sales: 1 } },
        { id: "funnel", text: "Tydlig funnel per målgrupp", score: { complexity: 2, data: 2, sales: 1 } },
        { id: "revenue", text: "Systematiskt kopplat till revenue", score: { complexity: 3, data: 3, sales: 1 } },
      ],
    },
    {
      id: "channels",
      dimension: "Kanaler",
      title: "Vilka kanaler är viktigast för er idag?",
      help: "Fler kanaler ökar behov av orkestrering och konsistens.",
      answers: [
        { id: "email_only", text: "Mest e-post", score: { complexity: 0, data: 1, sales: 0 } },
        { id: "email_web", text: "E-post + webb", score: { complexity: 1, data: 1, sales: 0 } },
        { id: "multi", text: "Multi-channel (social, ads, events)", score: { complexity: 2, data: 2, sales: 1 } },
        { id: "omni", text: "Omnichannel + flera marknader", score: { complexity: 3, data: 3, sales: 1 } },
      ],
    },
    {
      id: "integration_need",
      dimension: "Integrationer",
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
      dimension: "Mål",
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
      dimension: "Resurser",
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
      dimension: "Ansvar",
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
  // 2) Stack mapping
  // ----------------------------
  const STACKS = [
    {
      key: "starter",
      title: "Starter stack",
      summary:
        "Du behöver snabb effekt utan att bygga ett monster. Fokus: enkla flöden, bra segmentering och stabil tracking.",
      setup: [
        "ActiveCampaign (eller liknande lätt MA-verktyg)",
        "GA4 + GTM (ren event taxonomi)",
        "Enkel CRM-light eller pipeline (om sälj finns)",
      ],
    },
    {
      key: "growth_hubspot",
      title: "Growth stack (HubSpot)",
      summary:
        "Ni är redo för en riktig all-in-one där CRM och automation sitter ihop. Fokus: lifecycle stages, lead scoring och tydliga nurturing-flöden.",
      setup: [
        "HubSpot (Starter/Pro beroende på behov)",
        "Standardiserad datamodell (fält + ägarskap)",
        "GA4 + GTM + grundläggande dashboarding",
      ],
    },
    {
      key: "scale_revops",
      title: "Scale stack (RevOps)",
      summary:
        "Ni behöver orkestrering mellan marknad och sälj. Fokus: integrationsdisciplin, governance och rapportering som driver beslut.",
      setup: [
        "HubSpot Pro/Enterprise eller Pardot-liknande",
        "CRM som källa till sanning + tydliga processer",
        "BI-light (t.ex. Looker Studio) + datakvalitetsrutiner",
      ],
    },
    {
      key: "enterprise_light",
      title: "Enterprise-light stack",
      summary:
        "Hög komplexitet och många system. Här handlar det mer om arkitektur än kampanjer: integrationer, datalager och governance.",
      setup: [
        "Salesforce + (Marketing Cloud/Pardot) beroende på upplägg",
        "Integrationslager (t.ex. iPaaS) + tydliga data owners",
        "BI/datalager och strikt samtyckeshantering",
      ],
    },
  ];

  function pickStack(scores) {
    // scores: {complexity, data, sales}
    // Vi använder en enkel beslutsträd-ish logik (lätt att förstå och tweaka).
    const c = scores.complexity;
    const d = scores.data;
    const s = scores.sales;

    // Justera trösklar om du vill. Nu är de rimliga för 10 frågor med 0-3 per svar.
    const total = c + d + s;

    // Enterprise-light: hög total + hög complexity + hög data
    if (total >= 22 && c >= 8 && d >= 8) return STACKS.find(x => x.key === "enterprise_light");

    // Scale/RevOps: hög total eller tydligt säljberoende + hög data
    if (total >= 16 || (s >= 10 && d >= 6)) return STACKS.find(x => x.key === "scale_revops");

    // Growth/HubSpot: medel total och hyfsad data
    if (total >= 10 && d >= 4) return STACKS.find(x => x.key === "growth_hubspot");

    // Annars: starter
    return STACKS.find(x => x.key === "starter");
  }

  // ----------------------------
  // 3) State
  // ----------------------------
  const state = {
    startedAt: null,
    currentIndex: 0,
    answers: {}, // {questionId: answerId}
    perQuestionTime: {}, // {questionId: ms}
    questionEnterAt: null,
  };

  // ----------------------------
  // 4) DOM refs
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

  const resultBadge = $("#result-badge");
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
  // 5) Render functions
  // ----------------------------
  function showScreen(which) {
    screenIntro.classList.add("hidden");
    screenQuiz.classList.add("hidden");
    screenResult.classList.add("hidden");

    which.classList.remove("hidden");
  }

  function renderQuestion() {
    const idx = state.currentIndex;
    const q = QUESTIONS[idx];

    // Time tracking (enter question)
    state.questionEnterAt = Date.now();

    // UI
    qTag.textContent = `Dimension: ${q.dimension}`;
    qTitle.textContent = q.title;
    qHelp.textContent = q.help;

    // Progress
    const total = QUESTIONS.length;
    const current = idx + 1;
    progressText.textContent = `Fråga ${current} av ${total}`;
    const pct = Math.round((idx / total) * 100); // 0% vid första
    progressBar.style.width = `${pct}%`;
    $(".progress").setAttribute("aria-valuenow", String(current));

    // Answers
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

    // Nav states
    btnBack.disabled = idx === 0;
    btnNext.disabled = !selectedId;
    stateHint.textContent = selectedId ? "Bra. Nästa." : "Välj ett svar för att gå vidare.";

    // Tracking: question_view
    dlPush("quiz_question_view", {
      quiz_id: "ma_stack_quiz_v1",
      question_id: q.id,
      question_index: idx + 1,
      dimension: q.dimension,
      has_previous_answer: Boolean(selectedId),
    });
  }

  function onSelectAnswer(e) {
    const btn = e.currentTarget;
    const qid = btn.dataset.questionId;
    const aid = btn.dataset.answerId;
    const idx = state.currentIndex;

    // Measure time on question
    const t = Date.now() - (state.questionEnterAt || Date.now());
    state.perQuestionTime[qid] = (state.perQuestionTime[qid] || 0) + t;
    state.questionEnterAt = Date.now(); // reset, so extra changes count too

    // Save answer
    state.answers[qid] = aid;

    // UI: mark selected
    [...answersEl.querySelectorAll(".answer")].forEach((b) => {
      b.classList.toggle("selected", b.dataset.answerId === aid);
    });
    btnNext.disabled = false;
    stateHint.textContent = "Bra. Nästa.";

    // Tracking: answer
    dlPush("quiz_answer", {
      quiz_id: "ma_stack_quiz_v1",
      question_id: qid,
      question_index: idx + 1,
      answer_id: aid,
      answer_text: btn.textContent,
      time_spent_ms: t,
    });
  }

  function computeScores() {
    const scores = { complexity: 0, data: 0, sales: 0 };

    for (const q of QUESTIONS) {
      const aid = state.answers[q.id];
      const ans = q.answers.find(a => a.id === aid);
      if (!ans) continue;
      scores.complexity += ans.score.complexity;
      scores.data += ans.score.data;
      scores.sales += ans.score.sales;
    }
    return scores;
  }

  function scoreLabel(score) {
    // Max per axis ~ 10 frågor * 3 = 30
    const buckets = [
      { min: 0, max: 7, label: "Låg" },
      { min: 8, max: 15, label: "Medel" },
      { min: 16, max: 23, label: "Hög" },
      { min: 24, max: 30, label: "Mycket hög" },
    ];
    return bucketize(score, buckets);
  }

  function renderResult() {
    const scores = computeScores();
    const chosen = pickStack(scores);

    const startedAt = state.startedAt || Date.now();
    const durationMs = Date.now() - startedAt;

    const cLabel = scoreLabel(scores.complexity);
    const dLabel = scoreLabel(scores.data);
    const sLabel = scoreLabel(scores.sales);

    resultBadge.textContent = "Din rekommenderade stack";
    resultTitle.textContent = chosen.title;
    resultSummary.textContent = chosen.summary;

    mComplexity.textContent = cLabel;
    mData.textContent = dLabel;
    mSales.textContent = sLabel;

    mComplexityNote.textContent = `Poäng: ${scores.complexity} / 30`;
    mDataNote.textContent = `Poäng: ${scores.data} / 30`;
    mSalesNote.textContent = `Poäng: ${scores.sales} / 30`;

    // CTA text kan ändras baserat på stack
    btnCTA.textContent = "Se rekommenderad setup";

    const debug = {
      quiz_id: "ma_stack_quiz_v1",
      started_at: startedAt,
      duration_ms: durationMs,
      scores,
      result_stack: chosen.key,
      answers: state.answers,
      per_question_time_ms: state.perQuestionTime,
      returning_user_hint: getReturningHint(),
      recommended_setup: chosen.setup,
    };
    debugEl.textContent = JSON.stringify(debug, null, 2);

    // Persist a tiny bit for returning-user experiments (inte PII)
    localStorage.setItem("ma_quiz_last_result", chosen.key);
    localStorage.setItem("ma_quiz_last_completed_at", String(Date.now()));

    // Tracking: complete
    dlPush("quiz_complete", {
      quiz_id: "ma_stack_quiz_v1",
      result_stack: chosen.key,
      duration_ms: durationMs,
      complexity_score: scores.complexity,
      data_score: scores.data,
      sales_score: scores.sales,
      complexity_bucket: cLabel,
      data_bucket: dLabel,
      sales_bucket: sLabel,
      answers_count: Object.keys(state.answers).length,
      returning_user_hint: getReturningHint(),
    });
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
  // 6) Flow control
  // ----------------------------
  function startQuiz({ demoFill = false } = {}) {
    state.startedAt = Date.now();
    state.currentIndex = 0;
    state.answers = {};
    state.perQuestionTime = {};
    state.questionEnterAt = null;

    showScreen(screenQuiz);

    dlPush("quiz_start", {
      quiz_id: "ma_stack_quiz_v1",
      returning_user_hint: getReturningHint(),
      demo_fill: demoFill,
    });

    if (demoFill) {
      // random answers to let you test analytics quickly
      for (const q of QUESTIONS) {
        const pick = q.answers[Math.floor(Math.random() * q.answers.length)];
        state.answers[q.id] = pick.id;
      }
      // Jump to result
      showResult();
      return;
    }

    renderQuestion();
  }

  function nextQuestion() {
    const q = QUESTIONS[state.currentIndex];
    const hasAnswer = Boolean(state.answers[q.id]);
    if (!hasAnswer) return;

    // close time on current question
    const t = Date.now() - (state.questionEnterAt || Date.now());
    state.perQuestionTime[q.id] = (state.perQuestionTime[q.id] || 0) + t;

    if (state.currentIndex < QUESTIONS.length - 1) {
      state.currentIndex += 1;
      renderQuestion();
    } else {
      showResult();
    }
  }

  function prevQuestion() {
    if (state.currentIndex === 0) return;

    const q = QUESTIONS[state.currentIndex];
    const t = Date.now() - (state.questionEnterAt || Date.now());
    state.perQuestionTime[q.id] = (state.perQuestionTime[q.id] || 0) + t;

    state.currentIndex -= 1;

    dlPush("quiz_back", {
      quiz_id: "ma_stack_quiz_v1",
      to_question_index: state.currentIndex + 1,
    });

    renderQuestion();
  }

  function showResult() {
    showScreen(screenResult);

    // Fill progress to 100
    progressBar.style.width = `100%`;

    renderResult();
  }

  function restart() {
    dlPush("quiz_restart", { quiz_id: "ma_stack_quiz_v1" });
    showScreen(screenIntro);
  }

  // CTA click: här kan du välja att navigera till en ny sida, öppna modal, etc.
function onCTA() {
  const scores = computeScores();
  const chosen = pickStack(scores);

  dlPush("result_cta_click", {
    quiz_id: "ma_stack_quiz_v1",
    cta_type: "recommended_setup",
    result_stack: chosen.key,
  });

  // Navigera till setup-sidan och skicka med stack i URL
  window.location.href = `setup.html?stack=${encodeURIComponent(chosen.key)}`;
}


  // ----------------------------
  // 7) Wire up
  // ----------------------------
  btnStart.addEventListener("click", () => startQuiz({ demoFill: false }));
  btnDemoFill.addEventListener("click", () => startQuiz({ demoFill: true }));
  btnNext.addEventListener("click", nextQuestion);
  btnBack.addEventListener("click", prevQuestion);
  btnRestart.addEventListener("click", restart);
  btnCTA.addEventListener("click", onCTA);

  // Initial screen
  showScreen(screenIntro);

  // Optional: track page_view hint (GTM usually does this; men här är en ren signal)
  dlPush("page_loaded", {
    quiz_id: "ma_stack_quiz_v1",
    returning_user_hint: getReturningHint(),
  });
})();

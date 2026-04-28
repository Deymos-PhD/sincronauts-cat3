// Netlify Function: pVANE semantic evaluator with OpenAI + Supabase persistence
// Ubicación final: /netlify/functions/pvane-evaluate.ts
//
// Variables requeridas en Netlify:
// OPENAI_API_KEY
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
//
// Opcional:
// OPENAI_MODEL

type PvaneRequest = {
  student_id?: string;
  milestone?: string;
  response?: string;
  identity?: "ingeniero" | "arqueologo" | "diplomatico" | "estratega" | string;
  history?: Array<{ role: "student" | "pvane"; content: string }>;
};

type PvaneEvaluation = {
  reconoce: number;
  explica: number;
  integra: number;
  star_awarded: number;
  unlock: boolean;
  readiness_delta: number;
  confidence: number;
  evidence: string[];
  misconception_flags: string[];
  feedback: string;
  next_prompt: string;
  ptorpedo_entry: {
    conceptos_validados: string[];
    conexion_lograda: string;
    error_a_corregir: string;
    frase_util_del_estudiante: string;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const milestones: Record<string, any> = {
  cat3_h1_termodinamica: {
    title: "Termodinámica celular",
    raa: ["RAA4", "RAA6", "RAA7"],
    core: ["energía", "primera ley", "segunda ley", "entropía", "ΔG", "espontaneidad", "exergónica", "endergónica"],
    integration: [
      "relaciona ΔG con espontaneidad",
      "distingue energía liberada versus energía requerida",
      "reconoce a la célula como sistema abierto"
    ],
    unlocks: "cat3_h2_atp_redox"
  },
  cat3_h2_atp_redox: {
    title: "ATP, acoplamiento y REDOX",
    raa: ["RAA4", "RAA7"],
    core: ["ATP", "ADP", "acoplamiento", "oxidación", "reducción", "NADH", "FADH2", "electrones"],
    integration: [
      "conecta hidrólisis de ATP con reacciones endergónicas",
      "explica REDOX como transferencia de electrones",
      "relaciona NADH/FADH2 con energía metabólica"
    ],
    unlocks: "cat3_h3_enzimas"
  },
  cat3_h3_enzimas: {
    title: "Enzimas",
    raa: ["RAA4", "RAA6", "RAA7"],
    core: ["enzima", "sustrato", "sitio activo", "energía de activación", "complejo ES", "inhibición competitiva", "inhibición no competitiva"],
    integration: [
      "explica que la enzima baja la energía de activación",
      "distingue especificidad de velocidad",
      "relaciona inhibición con cambios en actividad enzimática"
    ],
    unlocks: "cat3_h4_metabolismo_red"
  },
  cat3_h4_metabolismo_red: {
    title: "Metabolismo como red",
    raa: ["RAA4", "RAA7"],
    core: ["metabolismo", "catabolismo", "anabolismo", "exergónico", "endergónico", "oxidativo", "reductivo"],
    integration: [
      "relaciona catabolismo con oxidación y liberación de energía",
      "relaciona anabolismo con reducción y gasto de energía",
      "entiende metabolismo como red acoplada"
    ],
    unlocks: "cat3_h5_resp_aerobica"
  },
  cat3_h5_resp_aerobica: {
    title: "Respiración aeróbica",
    raa: ["RAA4", "RAA7"],
    core: ["glucólisis", "piruvato", "acetil CoA", "ciclo de Krebs", "cadena transportadora", "fosforilación oxidativa", "oxígeno", "ATP"],
    integration: [
      "ordena etapas de la respiración celular",
      "conecta NADH/FADH2 con cadena transportadora",
      "explica el rol del oxígeno como aceptor final"
    ],
    unlocks: "cat3_h6_anaerobiosis_fermentacion"
  },
  cat3_h6_anaerobiosis_fermentacion: {
    title: "Anaerobiosis y fermentación",
    raa: ["RAA4", "RAA7"],
    core: ["anaeróbica", "fermentación", "lactato", "etanol", "piruvato", "NAD+", "NADH", "glucólisis"],
    integration: [
      "distingue respiración anaeróbica de fermentación",
      "explica que la fermentación regenera NAD+",
      "conecta regeneración de NAD+ con continuidad de la glucólisis"
    ],
    unlocks: null
  }
};

function clampQuarter(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(0, Math.min(1, n));
  return Math.round(clamped * 4) / 4;
}

function normalizeEvaluation(raw: any): PvaneEvaluation {
  const reconoce = clampQuarter(raw.reconoce);
  const explica = clampQuarter(raw.explica);
  const integra = clampQuarter(raw.integra);

  const total = reconoce + explica + integra;
  let star_awarded = 0;
  if (total >= 2.5 && integra >= 0.75) star_awarded = 1;
  else if (total >= 1.75) star_awarded = 0.5;
  else if (total >= 0.75) star_awarded = 0.25;

  const unlock = Boolean(raw.unlock) && reconoce >= 0.75 && explica >= 0.5;

  return {
    reconoce,
    explica,
    integra,
    star_awarded,
    unlock,
    readiness_delta: clampQuarter(raw.readiness_delta ?? star_awarded),
    confidence: clampQuarter(raw.confidence ?? 0.75),
    evidence: Array.isArray(raw.evidence) ? raw.evidence.slice(0, 4) : [],
    misconception_flags: Array.isArray(raw.misconception_flags) ? raw.misconception_flags.slice(0, 4) : [],
    feedback: String(raw.feedback || "Respuesta evaluada. Continúa refinando la conexión conceptual."),
    next_prompt: String(raw.next_prompt || "Explícalo ahora conectando causa, proceso y consecuencia celular."),
    ptorpedo_entry: {
      conceptos_validados: Array.isArray(raw.ptorpedo_entry?.conceptos_validados)
        ? raw.ptorpedo_entry.conceptos_validados.slice(0, 6)
        : [],
      conexion_lograda: String(raw.ptorpedo_entry?.conexion_lograda || ""),
      error_a_corregir: String(raw.ptorpedo_entry?.error_a_corregir || ""),
      frase_util_del_estudiante: String(raw.ptorpedo_entry?.frase_util_del_estudiante || "")
    }
  };
}

function extractOutputText(data: any): string {
  if (typeof data.output_text === "string") return data.output_text;

  const parts: string[] = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n");
}

async function saveProgressToSupabase(payload: {
  student_id: string;
  milestone: string;
  evaluation: PvaneEvaluation;
}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      saved: false,
      reason: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing"
    };
  }

  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/pvane_progress`;

  const row = {
    student_id: payload.student_id,
    milestone: payload.milestone,
    reconoce: payload.evaluation.reconoce,
    explica: payload.evaluation.explica,
    integra: payload.evaluation.integra,
    star_awarded: payload.evaluation.star_awarded,
    unlock: payload.evaluation.unlock,
    updated_at: new Date().toISOString()
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(row)
  });

  const text = await res.text();

  if (!res.ok) {
    return {
      saved: false,
      reason: "Supabase insert failed",
      status: res.status,
      details: text.slice(0, 800)
    };
  }

  return {
    saved: true,
    row: text ? JSON.parse(text) : null
  };
}

export async function handler(event: any) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "OPENAI_API_KEY missing" }),
      };
    }

    const body: PvaneRequest = JSON.parse(event.body || "{}");
    const studentResponse = String(body.response || "").trim();
    const milestoneId = body.milestone || "cat3_h1_termodinamica";
    const milestone = milestones[milestoneId] || milestones.cat3_h1_termodinamica;
    const identity = body.identity || "sin_identidad_definida";
    const studentId = body.student_id || "demo";

    if (studentResponse.length < 12) {
      const evaluation: PvaneEvaluation = {
        reconoce: 0,
        explica: 0,
        integra: 0,
        star_awarded: 0,
        unlock: false,
        readiness_delta: 0,
        confidence: 1,
        evidence: [],
        misconception_flags: ["respuesta_demasiado_breve"],
        feedback: "Necesito una respuesta un poco más desarrollada para evaluar mérito conceptual.",
        next_prompt: "Explícalo con una relación causal: ¿qué ocurre, por qué ocurre y qué consecuencia tiene para la célula?",
        ptorpedo_entry: {
          conceptos_validados: [],
          conexion_lograda: "",
          error_a_corregir: "Respuesta insuficiente para validar hito.",
          frase_util_del_estudiante: ""
        }
      };

      const persistence = await saveProgressToSupabase({
        student_id: studentId,
        milestone: milestoneId,
        evaluation
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          milestone: milestoneId,
          milestone_title: milestone.title,
          evaluation,
          persistence
        }),
      };
    }

    const systemPrompt = `
Eres pVANE, tutor socrático adaptativo de la Ruta CAT3 de Biología Celular CBI111.
Tu tarea NO es regalar respuestas ni regalar estrellas.
Evalúas evidencia conceptual del estudiante en tres niveles:
- reconoce: identifica conceptos relevantes y los usa con sentido básico.
- explica: establece relaciones causales o funcionales correctas.
- integra: conecta conceptos en una red celular/metabólica con consecuencia funcional.

Reglas:
1. Puntúa reconoce, explica e integra solo con 0, 0.25, 0.5, 0.75 o 1.
2. No premies léxico suelto si no hay relación conceptual.
3. Si hay memorización sin conexión, reconoce puede subir, pero integra debe quedar bajo.
4. Si hay errores graves, registra misconception_flags.
5. El desbloqueo solo procede si reconoce >= 0.75 y explica >= 0.5.
6. El feedback debe ser breve, útil y socrático.
7. next_prompt debe guiar al estudiante sin entregar la respuesta completa.
8. ptorpedo_entry solo debe incluir conocimiento validado desde la respuesta del estudiante.
9. Usa español chileno claro, académico y amable.
10. Ajusta el tono según identidad: ${identity}.
`;

    const userPrompt = `
HITO ACTUAL:
${JSON.stringify(milestone, null, 2)}

RESPUESTA DEL ESTUDIANTE:
"""${studentResponse}"""

HISTORIAL RECIENTE:
${JSON.stringify(body.history || [])}

Devuelve SOLO JSON válido con esta forma:
{
  "reconoce": 0,
  "explica": 0,
  "integra": 0,
  "unlock": false,
  "readiness_delta": 0,
  "confidence": 0.75,
  "evidence": ["..."],
  "misconception_flags": ["..."],
  "feedback": "...",
  "next_prompt": "...",
  "ptorpedo_entry": {
    "conceptos_validados": ["..."],
    "conexion_lograda": "...",
    "error_a_corregir": "...",
    "frase_util_del_estudiante": "..."
  }
}
`;

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "pvane_evaluation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                reconoce: { type: "number" },
                explica: { type: "number" },
                integra: { type: "number" },
                unlock: { type: "boolean" },
                readiness_delta: { type: "number" },
                confidence: { type: "number" },
                evidence: { type: "array", items: { type: "string" } },
                misconception_flags: { type: "array", items: { type: "string" } },
                feedback: { type: "string" },
                next_prompt: { type: "string" },
                ptorpedo_entry: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    conceptos_validados: { type: "array", items: { type: "string" } },
                    conexion_lograda: { type: "string" },
                    error_a_corregir: { type: "string" },
                    frase_util_del_estudiante: { type: "string" }
                  },
                  required: ["conceptos_validados", "conexion_lograda", "error_a_corregir", "frase_util_del_estudiante"]
                }
              },
              required: [
                "reconoce",
                "explica",
                "integra",
                "unlock",
                "readiness_delta",
                "confidence",
                "evidence",
                "misconception_flags",
                "feedback",
                "next_prompt",
                "ptorpedo_entry"
              ]
            }
          }
        },
        max_output_tokens: 900
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "OpenAI request failed",
          status: openaiResponse.status,
          details: errText.slice(0, 800)
        }),
      };
    }

    const data = await openaiResponse.json();
    const outputText = extractOutputText(data);
    const parsed = JSON.parse(outputText);
    const evaluation = normalizeEvaluation(parsed);

    const persistence = await saveProgressToSupabase({
      student_id: studentId,
      milestone: milestoneId,
      evaluation
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        milestone: milestoneId,
        milestone_title: milestone.title,
        model,
        evaluation,
        persistence
      }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Error en evaluación pVANE",
        details: error instanceof Error ? error.message : "unknown",
      }),
    };
  }
}

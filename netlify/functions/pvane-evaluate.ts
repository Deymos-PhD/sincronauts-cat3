// Netlify Function: pVANE evaluator (simulador inicial)
// Ubicación: /netlify/functions/pvane-evaluate.ts

type PvaneRequest = {
  student_id?: string;
  milestone?: string;
  response?: string;
};

type PvaneResult = {
  reconoce: number;
  explica: number;
  integra: number;
  star_awarded: number;
  unlock: boolean;
  feedback: string;
};

export async function handler(event: any) {
  try {
    // Validar método
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Método no permitido" }),
      };
    }

    // Parsear body
    const body: PvaneRequest = JSON.parse(event.body || "{}");

    const response = (body.response || "").toLowerCase();
    const milestone = body.milestone || "unknown";

    // --- SIMULADOR SEMÁNTICO BÁSICO (temporal) ---
    // Detecta presencia de conceptos clave para termodinámica celular

    let reconoce = 0;
    let explica = 0;
    let integra = 0;

    const conceptosReconoce = ["energía", "atp", "endergónica", "exergónica"];
    const conceptosExplica = ["acoplamiento", "espontánea", "delta g", "metabolismo"];
    const conceptosIntegra = ["trabajo celular", "síntesis", "catabolismo", "anabolismo"];

    if (conceptosReconoce.some(c => response.includes(c))) {
      reconoce = 0.5;
    }

    if (conceptosExplica.some(c => response.includes(c))) {
      explica = 0.5;
    }

    if (conceptosIntegra.some(c => response.includes(c))) {
      integra = 0.5;
    }

    // Ajuste simple de estrella
    const star_awarded = reconoce + explica + integra >= 1 ? 0.5 : 0.25;

    // Regla de desbloqueo preliminar
    const unlock = reconoce >= 0.5 && explica >= 0.5;

    const result: PvaneResult = {
      reconoce,
      explica,
      integra,
      star_awarded,
      unlock,
      feedback: unlock
        ? "Buen progreso conceptual. Puedes avanzar al siguiente hito."
        : "Relaciona ΔG con espontaneidad y metabolismo celular para avanzar.",
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        milestone,
        evaluation: result,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error en evaluación pVANE",
        details: error instanceof Error ? error.message : "unknown",
      }),
    };
  }
}

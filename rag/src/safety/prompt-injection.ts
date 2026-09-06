/**
 * Structured result returned from a prompt injection safety evaluation.
 */
export interface PromptInjectionResult {
  /** True if no injection or adversarial patterns were detected */
  isSafe: boolean;
  /** Numerical risk score between 0.0 (completely benign) and 1.0 (critical injection risk) */
  riskScore: number;
  /** Identifiers or names of pattern heuristics triggered */
  flaggedPatterns: string[];
  /** Human-readable explanation of why the input was flagged */
  reason?: string;
}

/**
 * Interface defining contract for prompt injection detectors.
 * Modular design allows swapping rule-based detection for ML classifiers or LLM-as-a-judge guardrails.
 */
export interface PromptInjectionDetector {
  /**
   * Evaluates input text for prompt injection and adversarial manipulation attempts.
   *
   * @param text - The query or input text to check
   * @returns A promise or value resolving to a structured PromptInjectionResult
   */
  check(text: string): Promise<PromptInjectionResult> | PromptInjectionResult;
}

export interface HeuristicRule {
  id: string;
  name: string;
  pattern: RegExp;
  weight: number;
}

/**
 * Rule-based prompt injection detector.
 * Scans input text against known adversarial patterns, system prompt overrides, delimiter attacks,
 * and jailbreak signatures.
 *
 * NOTE: This is a fast, lightweight first line of defense and does not guarantee 100% protection against
 * sophisticated or novel obfuscation techniques.
 */
export class RuleBasedInjectionDetector implements PromptInjectionDetector {
  private rules: HeuristicRule[];
  private threshold: number;

  /**
   * @param threshold - Risk score threshold above which input is flagged as unsafe (default: 0.4)
   * @param customRules - Optional additional heuristic rules to evaluate
   */
  constructor(threshold: number = 0.4, customRules: HeuristicRule[] = []) {
    this.threshold = threshold;
    this.rules = [
      {
        id: 'ignore-previous',
        name: 'Instruction Override Attempt',
        pattern: /(?:ignore|disregard|forget|bypass|override)\s+(?:all\s+)?(?:previous|prior|above|existing)\s+(?:instructions|prompts|commands|rules|guidelines)/i,
        weight: 0.7,
      },
      {
        id: 'system-prompt-extraction',
        name: 'System Prompt Extraction',
        pattern: /(?:reveal|repeat|print|show|output|leak)\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions|internal\s+directives|base\s+instructions)/i,
        weight: 0.6,
      },
      {
        id: 'jailbreak-dan',
        name: 'Jailbreak Persona Hijacking',
        pattern: /\b(?:dan\s+mode|jailbreak|developer\s+mode\s+enabled|do\s+anything\s+now|unrestricted\s+ai|evil\s+bot)\b/i,
        weight: 0.8,
      },
      {
        id: 'role-tag-injection',
        name: 'System Tag & Delimiter Injection',
        pattern: /(?:<\|(?:im_start|im_end|system|user|assistant)\|>|<system>|<\/system>|\[INST\]|\[\/INST\]|###\s*(?:system|instruction|human|assistant):)/i,
        weight: 0.65,
      },
      {
        id: 'hypothetical-override',
        name: 'Hypothetical / Simulation Override',
        pattern: /(?:pretend\s+you\s+have\s+no\s+(?:rules|restrictions|filters)|you\s+are\s+now\s+in\s+a\s+simulation\s+without\s+rules)/i,
        weight: 0.6,
      },
      ...customRules,
    ];
  }

  /**
   * Evaluates input string for injection patterns.
   */
  public check(text: string): PromptInjectionResult {
    if (!text || text.trim().length === 0) {
      return {
        isSafe: true,
        riskScore: 0.0,
        flaggedPatterns: [],
      };
    }

    const flagged: string[] = [];
    let maxWeight = 0;
    let accumulatedScore = 0;

    for (const rule of this.rules) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(text)) {
        flagged.push(rule.name);
        maxWeight = Math.max(maxWeight, rule.weight);
        accumulatedScore += rule.weight;
      }
      rule.pattern.lastIndex = 0;
    }

    // Combine max weight with a diminishing return for multiple matches
    const calculatedScore = Math.min(
      1.0,
      maxWeight + (accumulatedScore - maxWeight) * 0.3
    );

    const isSafe = calculatedScore < this.threshold;

    return {
      isSafe,
      riskScore: Math.round(calculatedScore * 100) / 100,
      flaggedPatterns: flagged,
      reason: isSafe
        ? undefined
        : `Potential prompt injection detected (${flagged.join(', ')}). Risk score: ${calculatedScore.toFixed(2)}`,
    };
  }
}

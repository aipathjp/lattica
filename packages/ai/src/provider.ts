/**
 * Provider abstraction for Lattica's AI layer.
 *
 * Lattica is provider-agnostic: the concrete LLM (OpenAI, Anthropic, a local
 * model, …) lives behind the {@link AIProvider} interface and is injected by the
 * caller. This keeps the package free of any network/SDK dependency and makes
 * every code path testable with a deterministic {@link MockProvider}.
 */

/** Token accounting for a single (or accumulated) provider call. */
export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Request for free-form text generation. */
export interface GenerateTextRequest {
  prompt: string;
  system?: string;
  maxOutputTokens?: number;
}

/** Request for structured (JSON-shaped) generation against a schema. */
export interface GenerateObjectRequest {
  prompt: string;
  system?: string;
  schema: object;
  maxOutputTokens?: number;
}

/** Result of {@link AIProvider.generateText}. */
export interface GenerateTextResult {
  text: string;
  usage: AIUsage;
}

/** Result of {@link AIProvider.generateObject}. */
export interface GenerateObjectResult<T> {
  object: T;
  usage: AIUsage;
}

/** The injectable LLM boundary. Implementations must be side-effect free. */
export interface AIProvider {
  readonly model: string;
  generateText(req: GenerateTextRequest): Promise<GenerateTextResult>;
  generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResult<T>>;
}

/** Options for {@link MockProvider}. */
export interface MockProviderOptions {
  model?: string;
  texts?: string[];
  objects?: unknown[];
}

/**
 * Deterministic in-memory provider for tests and offline development.
 *
 * Queued `texts`/`objects` are returned in order; once a queue is exhausted the
 * corresponding method throws. Usage is derived deterministically from the
 * prompt length so assertions are stable.
 */
export class MockProvider implements AIProvider {
  readonly model: string;
  private readonly texts: string[];
  private readonly objects: unknown[];
  private textIndex = 0;
  private objectIndex = 0;

  constructor(opts: MockProviderOptions = {}) {
    this.model = opts.model ?? 'mock';
    this.texts = opts.texts ? [...opts.texts] : [];
    this.objects = opts.objects ? [...opts.objects] : [];
  }

  private usageFor(req: { prompt: string; system?: string }, output: string): AIUsage {
    const inputChars = req.prompt.length + (req.system?.length ?? 0);
    return {
      inputTokens: Math.ceil(inputChars / 4) + 1,
      outputTokens: Math.ceil(output.length / 4) + 1,
    };
  }

  generateText(req: GenerateTextRequest): Promise<GenerateTextResult> {
    const text = this.texts[this.textIndex];
    if (text === undefined) {
      throw new Error('MockProvider: text queue exhausted');
    }
    this.textIndex += 1;
    return Promise.resolve({ text, usage: this.usageFor(req, text) });
  }

  generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResult<T>> {
    const object = this.objects[this.objectIndex];
    if (object === undefined) {
      throw new Error('MockProvider: object queue exhausted');
    }
    this.objectIndex += 1;
    return Promise.resolve({
      object: object as T,
      usage: this.usageFor(req, JSON.stringify(object)),
    });
  }
}

import type {
  PublishRequest,
  PublishResult,
  SocialPlatform
} from "@pulse/contracts";

export interface CredentialResolver {
  getAccessToken(accountId: string): Promise<string>;
}

export interface SocialProvider {
  readonly platform: SocialPlatform;
  publish(request: PublishRequest): Promise<PublishResult>;
  getStatus(accountId: string, externalId: string): Promise<PublishResult>;
}

export abstract class TokenAwareProvider implements SocialProvider {
  abstract readonly platform: SocialPlatform;

  constructor(protected readonly credentials: CredentialResolver) {}

  abstract publish(request: PublishRequest): Promise<PublishResult>;
  abstract getStatus(accountId: string, externalId: string): Promise<PublishResult>;

  protected async token(accountId: string) {
    const token = await this.credentials.getAccessToken(accountId);
    if (!token) throw new Error("Missing access token for account " + accountId);
    return token;
  }

  protected requiredMetadata<T = string>(
    request: PublishRequest,
    key: string
  ): T {
    const value = request.content.metadata?.[key];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Missing publish metadata: ${key}`);
    }
    return value as T;
  }
}

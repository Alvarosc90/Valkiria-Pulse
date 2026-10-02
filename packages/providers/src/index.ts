import type {
  PublishRequest,
  PublishResult,
  SocialPlatform
} from "@pulse/contracts";

export interface SocialProvider {
  readonly platform: SocialPlatform;
  publish(request: PublishRequest): Promise<PublishResult>;
  getStatus(externalId: string): Promise<PublishResult>;
}

export abstract class TokenAwareProvider implements SocialProvider {
  abstract readonly platform: SocialPlatform;
  abstract publish(request: PublishRequest): Promise<PublishResult>;
  abstract getStatus(externalId: string): Promise<PublishResult>;

  protected assertCredential(value: string | undefined, name: string): string {
    if (!value) throw new Error(`Missing credential: ${name}`);
    return value;
  }
}

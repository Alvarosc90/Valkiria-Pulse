import {
  InstagramProvider,
  LinkedInProvider,
  TikTokProvider,
  type SocialProvider
} from "@pulse/providers";
import type { SocialPlatform } from "@pulse/contracts";
import { DbCredentialResolver } from "./dbCredentialResolver.js";

const credentials = new DbCredentialResolver();

const providers = new Map<SocialPlatform, SocialProvider>([
  ["instagram", new InstagramProvider(credentials)],
  ["tiktok", new TikTokProvider(credentials)],
  ["linkedin", new LinkedInProvider(credentials)]
]);

export function providerFor(platform: SocialPlatform): SocialProvider {
  const provider = providers.get(platform);
  if (!provider) throw new Error("No provider registered for " + platform);
  return provider;
}

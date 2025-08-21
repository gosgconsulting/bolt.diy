import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

function getProviderInfo(
  llmManager: LLMManager,
  options: {
    apiKeys?: Record<string, string>;
    serverEnv?: Record<string, string>;
  },
) {
  const { apiKeys, serverEnv } = options;
  const allProviders = llmManager.getAllProviders();

  // Only expose providers that have configuration (env on server or user API key in cookies)

  const filteredProviders: ProviderInfo[] = allProviders
    .filter((provider) => {
      const tokenKey = provider.config?.apiTokenKey;
      if (!tokenKey) {
        // providers without token requirement stay available
        return true;
      }

      const hasKey = Boolean(
        apiKeys?.[provider.name] ||
          serverEnv?.[tokenKey] ||
          (typeof process !== 'undefined' && (process as any)?.env?.[tokenKey]),
      );

      return hasKey;
    })
    .map((provider) => ({
      name: provider.name,
      staticModels: provider.staticModels,
      getApiKeyLink: provider.getApiKeyLink,
      labelForGetApiKey: provider.labelForGetApiKey,
      icon: provider.icon,
    }));

  // Keep existing default provider selection, UI will correct if it's not in filtered list
  const dp = llmManager.getDefaultProvider();
  const defaultProvider: ProviderInfo = {
    name: dp.name,
    staticModels: dp.staticModels,
    getApiKeyLink: dp.getApiKeyLink,
    labelForGetApiKey: dp.labelForGetApiKey,
    icon: dp.icon,
  };

  return { providers: filteredProviders, defaultProvider };
}

export async function loader({
  request,
  params,
  context,
}: {
  request: Request;
  params: { provider?: string };
  context: {
    cloudflare?: {
      env: Record<string, string>;
    };
  };
}): Promise<Response> {
  const llmManager = LLMManager.getInstance(context.cloudflare?.env);

  // Get client side maintained API keys and provider settings from cookies
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  const { providers, defaultProvider } = getProviderInfo(llmManager, {
    apiKeys,
    serverEnv: context.cloudflare?.env,
  });

  let modelList: ModelInfo[] = [];

  if (params.provider) {
    // Only update models for the specific provider
    const provider = llmManager.getProvider(params.provider);

    if (provider) {
      modelList = await llmManager.getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: context.cloudflare?.env,
      });
    }
  } else {
    // Update all models
    modelList = await llmManager.updateModelList({
      apiKeys,
      providerSettings,
      serverEnv: context.cloudflare?.env,
    });
  }

  return json<ModelsResponse>({
    modelList,
    providers,
    defaultProvider,
  });
}

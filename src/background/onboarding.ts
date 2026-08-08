export const maybeOpenOnboarding = async (): Promise<void> => {
  const stored = await chrome.storage.local.get('onboardingShown');
  if (stored.onboardingShown === true) return;
  await chrome.storage.local.set({ onboardingShown: true });
  await chrome.tabs.create({ url: chrome.runtime.getURL('ui/onboarding/onboarding.html') });
};

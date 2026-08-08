const setExtensionLink = (id: string, path: string) => {
  const link = document.getElementById(id);
  if (link instanceof HTMLAnchorElement) link.href = chrome.runtime.getURL(path);
};

setExtensionLink('privacy-link', 'ui/privacy/privacy.html');
setExtensionLink('settings-link', 'ui/options/options.html');

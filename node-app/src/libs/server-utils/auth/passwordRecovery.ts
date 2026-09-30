const WORDPRESS_PASSWORD_RECOVERY_PATH = "/my-account/lost-password/";

export function wordpressPasswordRecoveryUrl(wpHomeUrl: string) {
  const url = new URL(wpHomeUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("INVALID_WORDPRESS_HOME_URL");
  }
  url.pathname = WORDPRESS_PASSWORD_RECOVERY_PATH;
  url.search = "";
  url.hash = "";
  return url;
}

import { redirect } from "next/navigation";
import MagazineLoginAutoStart from "components/module/auth/MagazineLoginAutoStart";
import {
  isMagazineAuthProvider,
  type MagazineAuthProvider,
} from "libs/server-utils/auth/magazineLoginIntent";
import { normalizeSsoReturnTo } from "libs/server-utils/auth/ssoTicketService";

type PageProps = { searchParams: Promise<{ provider?: string; returnTo?: string }> };

export default async function MagazineLoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  if (!isMagazineAuthProvider(params.provider)) redirect("/login?error=MAGAZINE_LOGIN_INVALID");
  let returnTo = "";
  try {
    returnTo = normalizeSsoReturnTo(params.returnTo, "magazine");
  } catch {
    redirect("/login?error=MAGAZINE_LOGIN_INVALID");
  }
  return <MagazineLoginAutoStart provider={params.provider as MagazineAuthProvider} returnTo={returnTo} />;
}

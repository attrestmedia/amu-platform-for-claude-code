export interface MailAddress {
  address: string;
  name?: string;
}

export interface MailHeader {
  name: string;
  value: string;
}

export interface MailProviderInput {
  from: MailAddress;
  to: string;
  replyTo?: readonly string[];
  headers?: readonly MailHeader[];
  subject: string;
  text: string;
  html: string;
  configurationSet: string;
  tags?: Readonly<Record<string, string>>;
}

export interface MailProviderResult {
  providerMessageId: string;
}

export interface MailProvider {
  send(input: MailProviderInput): Promise<MailProviderResult>;
}

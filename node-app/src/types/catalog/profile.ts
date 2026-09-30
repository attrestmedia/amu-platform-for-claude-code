// Profile SNS Type
export interface IProfileSNS {
  name: string;
  url: string;
  desc?: string;
}

// Profile Type
export interface IProfile {
  src: string;
  name: string;
  url: string;
  sns?: IProfileSNS[];
}

// Profile 스키마 인터페이스
export interface IUserProfileData {
  type: "profile";
  data: IProfile;
}

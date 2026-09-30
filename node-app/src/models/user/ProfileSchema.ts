import mongoose, { Schema, Document } from "mongoose";
import type { IProfileSNS, IProfile } from "types/catalog";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(name, url, desc, src, name, url) 및 인덱스/기본값 선언
 * @domain user_profile
 * @scope db_schema
 */

export interface IUserProfileData extends Document {
  userId: string; // 추가
  data: IProfile;
}

export interface Profile extends Document {
  id: string;
  name: string;
  src?: string;
  url?: number;
  sns?: IProfileSNS[];
}

const SocialSchema: Schema = new Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  desc: { type: String, required: false },
});

const ProfileSchema: Schema = new Schema({
  src: { type: String, required: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
  sns: {
    type: [SocialSchema],
    required: false,
  },
});

// 프로필 스키마
export const UserProfileSchema = new mongoose.Schema<IUserProfileData>({
  userId: { type: String, required: true, unique: true }, // 중복 방지를 위한 고유 인덱스 설정
  data: { type: ProfileSchema, required: true },
});

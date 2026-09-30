import type { UnknownRecord } from "utils/common/typeUtils";

export interface IGetDocumentsData {
  db: string; // 사용할 데이터베이스 이름
  collection: string; // 조회할 컬렉션 이름
  id?: string; // collection의 _id 조건 검색
  uid?: string;
  pid?: string;
  name?: string;
  filter?: UnknownRecord; // 추가 필터 조건 (객체 형태)
}

export interface IGetDocumentsResponse {
  data: unknown[]; // API 응답의 data 필드 (문서 배열)
}

// 공통 페이징 타입
export interface IPaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

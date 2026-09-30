import mongoose from "mongoose";

declare global {
  var mongoose: {
    conn: mongoose.Mongoose | null;
    promise: Promise<mongoose.Mongoose> | null;
  };
  var mongooseConnections: {
    [uri: string]: {
      conn: mongoose.Connection | null;
      promise: Promise<mongoose.Connection> | null;
    };
  };
}

export {}; // 파일이 모듈로 인식되지 않도록 빈 export 추가

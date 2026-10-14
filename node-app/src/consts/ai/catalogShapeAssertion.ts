// SSOT-112: facade alias 제거 뒤에도 생성 canonical 값이 기존 TS 타입에 맞는지 컴파일 시점에 검사한다.
export type AssertAssignable<T extends Shape, Shape> = T;

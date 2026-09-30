/**
 * @radix-ui/react-icons 타입 샘 처리
 * react-icons는 320개의 아이콘 파일을 가지고 있어
 * 매 컴포넌트마다 전체 패키지를 스캔하여 메모리를 폭증
 * 실제 사용하는 아이콘만 타입 정의
 */

declare module "@radix-ui/react-icons" {
  import { SVGProps } from "react";

  type IconProps = SVGProps<SVGSVGElement>;
  type Icon = React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;

  // 실제 사용하는 아이콘 정의
  export const CheckIcon: Icon;
  export const Cross2Icon: Icon;
  export const ChevronDownIcon: Icon;
  export const ChevronUpIcon: Icon;
  export const ChevronLeftIcon: Icon;
  export const ChevronRightIcon: Icon;
  export const DotsHorizontalIcon: Icon;
  export const MagnifyingGlassIcon: Icon;
  export const PlusIcon: Icon;
  export const MinusIcon: Icon;
  export const ReloadIcon: Icon;
  export const TrashIcon: Icon;
  export const Pencil1Icon: Icon;
  export const GearIcon: Icon;
  export const ExitIcon: Icon;

  // 나머지는 any로 처리
  const icons: Record<string, Icon>;
  export default icons;
}

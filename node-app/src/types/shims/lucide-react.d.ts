/**
 * lucide-react(https://lucide.dev/icons/) 타입 샘 처리
 * lucide-react는 1000개 이상의 아이콘 파일을 가지고 있어
 * 매 컴포넌트마다 전체 패키지를 스캔하여 메모리를 소비
 */

declare module "lucide-react" {
  import * as React from "react";

  // 아이콘 Props 타입
  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
    strokeWidth?: string | number;
  }

  export type LucideIcon = React.ForwardRefExoticComponent<
    React.PropsWithoutRef<LucideProps> & React.RefAttributes<SVGSVGElement>
  >;

  // ===== 네비게이션 & 화살표 =====
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronsLeft: LucideIcon;
  export const ChevronsRight: LucideIcon;
  export const ChevronsUp: LucideIcon;
  export const ChevronsDown: LucideIcon;
  export const ChevronsUpDown: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const ArrowRightCircle: LucideIcon;
  export const ArrowUp: LucideIcon;
  export const ArrowDown: LucideIcon;
  export const ArrowUpRight: LucideIcon;
  export const ArrowDownLeft: LucideIcon;
  export const ArrowBigLeft: LucideIcon;
  export const ArrowBigRight: LucideIcon;
  export const MoveLeft: LucideIcon;
  export const MoveRight: LucideIcon;

  // ===== UI 컨트롤 =====
  export const X: LucideIcon;
  export const Check: LucideIcon;
  export const Plus: LucideIcon;
  export const Minus: LucideIcon;
  export const Menu: LucideIcon;
  export const MoreHorizontal: LucideIcon;
  export const MoreVertical: LucideIcon;
  export const Search: LucideIcon;
  export const Settings: LucideIcon;
  export const Loader: LucideIcon;
  export const Loader2: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const RotateCw: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const FlipHorizontal2: LucideIcon;

  // ===== 파일 & 문서 =====
  export const File: LucideIcon;
  export const FileText: LucideIcon;
  export const Files: LucideIcon;
  export const Upload: LucideIcon;
  export const Download: LucideIcon;
  export const Crop: LucideIcon;
  export const Save: LucideIcon;
  export const Copy: LucideIcon;
  export const Clipboard: LucideIcon;
  export const FolderOpen: LucideIcon;
  export const Folder: LucideIcon;

  // ===== 에디팅 =====
  export const Edit: LucideIcon;
  export const Edit2: LucideIcon;
  export const Edit3: LucideIcon;
  export const Pencil: LucideIcon;
  export const Trash: LucideIcon;
  export const Trash2: LucideIcon;
  export const Delete: LucideIcon;
  export const SquarePen: LucideIcon;

  // ===== 미디어 =====
  export const Image: LucideIcon;
  export const Images: LucideIcon;
  export const GalleryVerticalEnd: LucideIcon;
  export const ImagePlus: LucideIcon;
  export const Video: LucideIcon;
  export const Camera: LucideIcon;
  export const Play: LucideIcon;
  export const Pause: LucideIcon;
  export const Volume: LucideIcon;
  export const Volume2: LucideIcon;
  export const VolumeX: LucideIcon;

  // ===== 커뮤니케이션 =====
  export const Mail: LucideIcon;
  export const Send: LucideIcon;
  export const MessageCircle: LucideIcon;
  export const Mic: LucideIcon;
  export const MessageSquare: LucideIcon;
  export const MessageSquarePlus: LucideIcon;
  export const MessageSquareText: LucideIcon;
  export const Phone: LucideIcon;
  export const Bell: LucideIcon;
  export const BellOff: LucideIcon;

  // ===== 사용자 & 프로필 =====
  export const User: LucideIcon;
  export const Users: LucideIcon;
  export const UserPlus: LucideIcon;
  export const UserMinus: LucideIcon;
  export const UserCheck: LucideIcon;
  export const UserX: LucideIcon;

  // ===== 상태 & 피드백 =====
  export const AlertCircle: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const ShieldAlert: LucideIcon;
  export const Info: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const XCircle: LucideIcon;
  export const HelpCircle: LucideIcon;

  // ===== 레이아웃 =====
  export const Layout: LucideIcon;
  export const LayoutDashboard: LucideIcon;
  export const LayoutGrid: LucideIcon;
  export const LayoutList: LucideIcon;
  export const Grid: LucideIcon;
  export const Grid3x3: LucideIcon;
  export const List: LucideIcon;
  export const ListChecks: LucideIcon;
  export const Maximize: LucideIcon;
  export const Minimize: LucideIcon;
  export const Maximize2: LucideIcon;
  export const Minimize2: LucideIcon;

  // ===== 쇼핑 & 커머스 =====
  export const ShoppingCart: LucideIcon;
  export const ShoppingBag: LucideIcon;
  export const Store: LucideIcon;
  export const Package: LucideIcon;
  export const Tag: LucideIcon;
  export const DollarSign: LucideIcon;
  export const CreditCard: LucideIcon;

  // ===== 게임 & 엔터테인먼트 =====
  export const Gamepad: LucideIcon;
  export const Gamepad2: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Star: LucideIcon;
  export const Heart: LucideIcon;
  export const Trophy: LucideIcon;
  export const Award: LucideIcon;
  export const Target: LucideIcon;
  export const MousePointer2: LucideIcon;

  // ===== 날씨 & 시간 =====
  export const Sun: LucideIcon;
  export const Moon: LucideIcon;
  export const Cloud: LucideIcon;
  export const Clock: LucideIcon;
  export const Calendar: LucideIcon;

  // ===== 설정 & 도구 =====
  export const Sliders: LucideIcon;
  export const Filter: LucideIcon;
  export const Wrench: LucideIcon;
  export const Tool: LucideIcon;
  export const Cog: LucideIcon;
  export const Brush: LucideIcon;
  export const Paintbrush: LucideIcon;
  export const Pipette: LucideIcon;

  // ===== 데이터 & 차트 =====
  export const BarChart: LucideIcon;
  export const BarChart2: LucideIcon;
  export const BarChart3: LucideIcon;
  export const LineChart: LucideIcon;
  export const PieChart: LucideIcon;
  export const TrendingUp: LucideIcon;
  export const TrendingDown: LucideIcon;
  export const Database: LucideIcon;

  // ===== 잠금 & 보안 =====
  export const Lock: LucideIcon;
  export const Unlock: LucideIcon;
  export const Key: LucideIcon;
  export const Shield: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;

  // ===== 연결 & 공유 =====
  export const Link: LucideIcon;
  export const Link2: LucideIcon;
  export const Unlink: LucideIcon;
  export const Share: LucideIcon;
  export const Share2: LucideIcon;
  export const ExternalLink: LucideIcon;

  // ===== 텍스트 & 타이포그래피 =====
  export const Type: LucideIcon;
  export const Bold: LucideIcon;
  export const Italic: LucideIcon;
  export const Underline: LucideIcon;
  export const AlignLeft: LucideIcon;
  export const AlignCenter: LucideIcon;
  export const AlignRight: LucideIcon;
  export const Keyboard: LucideIcon;

  // ===== 위치 & 지도 =====
  export const MapPin: LucideIcon;
  export const Map: LucideIcon;
  export const Navigation: LucideIcon;
  export const Compass: LucideIcon;

  // ===== 기타 자주 사용 =====
  export const Home: LucideIcon;
  export const LogIn: LucideIcon;
  export const LogOut: LucideIcon;
  export const Power: LucideIcon;
  export const Wifi: LucideIcon;
  export const WifiOff: LucideIcon;
  export const Zap: LucideIcon;
  export const Bookmark: LucideIcon;
  export const BookmarkCheck: LucideIcon;
  export const Flag: LucideIcon;
  export const Globe: LucideIcon;
  export const Coins: LucideIcon;
  export const Circle: LucideIcon;
  export const CircleCheck: LucideIcon;
  export const Dot: LucideIcon;
  export const ZoomIn: LucideIcon;
  export const ZoomOut: LucideIcon;
  export const Languages: LucideIcon;
  export const Handshake: LucideIcon;
  export const Crown: LucideIcon;
  export const MessageSquareHeart: LucideIcon;
  export const BookOpen: LucideIcon;
  export const NotepadText: LucideIcon;
  export const Bug: LucideIcon;
  export const Activity: LucideIcon;
  export const Book: LucideIcon;
  export const Archive: LucideIcon;
  export const MemoryStick: LucideIcon;
  export const GalleryHorizontal: LucideIcon;
  export const Bot: LucideIcon;
  export const Laugh: LucideIcon;
  export const Smile: LucideIcon;
  export const Frown: LucideIcon;
  export const Angry: LucideIcon;
  export const Meh: LucideIcon;
  export const Brain: LucideIcon;
  export const MoonStar: LucideIcon;
  export const Captions: LucideIcon;
  export const CaptionsOff: LucideIcon;
  export const PanelTop: LucideIcon;
  export const PanelTopClose: LucideIcon;
  export const PanelRight: LucideIcon;
  export const PanelRightClose: LucideIcon;
  export const Rows3: LucideIcon;
  export const History: LucideIcon;
  export const HeartPulse: LucideIcon;
  export const Wallet: LucideIcon;
  export const ToggleLeft: LucideIcon;
  export const ToggleRight: LucideIcon;
  export const Wand2: LucideIcon;
  export const GitBranch: LucideIcon;
  export const GitCommit: LucideIcon;
  export const Monitor: LucideIcon;
  export const RefreshCcw: LucideIcon;
  export const Settings2: LucideIcon;
  export const MessageSquareText: LucideIcon;
  export const Cpu: LucideIcon;
  export const Layers: LucideIcon;
  export const RatioIcon: LucideIcon;
  export const Paperclip: LucideIcon;
  export const Puzzle: LucideIcon;
  export const Eraser: LucideIcon;
  export const Box: LucideIcon;
  export const Lightbulb: LucideIcon;
  export const Wand: LucideIcon;
  export const PenOff: LucideIcon;
  export const SquareUserRound: LucideIcon;
  export const ContactRound: LucideIcon;
  export const Pin: LucideIcon;
  export const PinOff: LucideIcon;
  export const MessageCircleHeart: LucideIcon;
  export const Newspaper: LucideIcon;
  export const Undo2: LucideIcon;
  export const Redo2: LucideIcon;
  export const Scissors: LucideIcon;
  export const Hand: LucideIcon;
  export const Hexagon: LucideIcon;
  export const Square: LucideIcon;
  export const Triangle: LucideIcon;
  export const AppWindow: LucideIcon;
  export const Blocks: LucideIcon;
  export const LockKeyhole: LucideIcon;
  export const Radio: LucideIcon;
  export const Clock3: LucideIcon;
  export const SlidersVertical: LucideIcon;
  export const SquareTerminal: LucideIcon;

  // 정의되지 않은 아이콘
  const icons: Record<string, LucideIcon>;
  export default icons;
}

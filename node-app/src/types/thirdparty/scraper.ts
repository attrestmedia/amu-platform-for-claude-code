export interface INaverBlogPostItem {
  logNo: string;
  title: string;
  url: string;
  date: string;
}

export interface INaverBlogPostListResponse {
  blogId: string;
  count: number;
  source: "api" | "post-list" | "mixed";
  posts: INaverBlogPostItem[];
}

export interface IWebScrapeContentResponse {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  siteName: string;
  text: string;
  html?: string;
  imageUrls: string[];
}

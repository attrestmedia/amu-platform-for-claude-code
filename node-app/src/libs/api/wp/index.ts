// WP 관련
export { getPosts, getCategories, getPostTag, getAllPostTags } from "./wp";

// WP-Cache 관련
export {
  getCachedPosts,
  getCachedCategories,
  getCachedPostTag,
  getCachedAllPostTags,
  requestCacheUpdate,
  getCachedRandomPosts,
  getCachedLatestPosts,
  searchCachedPosts,
  getCachedPostDetail,
} from "./wpCache";

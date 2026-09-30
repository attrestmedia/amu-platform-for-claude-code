export type ThreadsProfileType = {
  id: string;
  username: string;
  name?: string;
  threadsProfilePictureUrl?: string;
  biography?: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
};

export type ThreadsPostType = {
  id: string;
  text?: string;
  permalink?: string;
  timestamp?: string;
  shortcode?: string;
  mediaProductType?: string;
  mediaType?: string;
  mediaUrl?: string;
  username?: string;
};

export type ThreadsPagingType = {
  cursors?: {
    before?: string;
    after?: string;
  };
  next?: string;
};

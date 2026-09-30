export type ContentPreviewLoadErrors = {
  public: boolean;
  owned: boolean;
};

export function createContentPreviewLoadErrors(
  overrides: Partial<ContentPreviewLoadErrors> = {},
): ContentPreviewLoadErrors {
  return {
    public: false,
    owned: false,
    ...overrides,
  };
}

export function hasContentPreviewLoadError(errors: ContentPreviewLoadErrors) {
  return errors.public || errors.owned;
}

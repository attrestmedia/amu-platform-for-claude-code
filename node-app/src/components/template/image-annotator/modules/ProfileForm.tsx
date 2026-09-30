import React, { useState } from "react";
import type { IProfile } from "types/catalog";
import { useMutation } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";
import { logger } from "utils/log";
import { Button } from "@amu-labs/ui";

interface ProfileFormProps {
  userId: string;
  onSuccess: (newProfile: IProfile) => void; // 새로운 프로필 데이터를 전달
}

const ProfileForm = ({ userId, onSuccess }: ProfileFormProps) => {
  const [src, setSrc] = useState("/datas/annotator/profiles/profile_01.jpg");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  // const sns: IProfileSNS[] = [];

  const { mutate, isPending } = useMutation<IProfile, Error, IProfile>({
    mutationFn: async (newProfileData: IProfile) => {
      const { data } = await fetchClient.post<IProfile>(`/${userId}/profile`, { data: newProfileData });
      return data;
    },
    onSuccess: (data) => {
      // 부모 컴포넌트로 새로운 프로필 데이터 전달
      onSuccess(data);
    },
    onError: (error: Error) => {
      logger.error("Error updating profile:", error);
      setError(error.message || "Error updating profile");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    const profileData: IProfile = {
      src,
      name,
      url,
      // sns,
    };

    mutate(profileData);
  };

  if (isPending) return <div>Saving profile...</div>;

  return (
    <form onSubmit={handleSubmit}>
      <h2>Profile Information</h2>
      <div>
        <label>
          Name(required):
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            required
          />
        </label>
      </div>
      <div>
        <label>
          Profile Image URL (src):
          <input type="text" value={src} onChange={(e) => setSrc(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          Website URL:
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      </div>
      {/* SNS 필드 추가가 필요하다면 여기에 추가 */}
      {error && <div style={{ color: "red" }}>{error}</div>}
      <Button>Save Profile</Button>
    </form>
  );
};

export default ProfileForm;

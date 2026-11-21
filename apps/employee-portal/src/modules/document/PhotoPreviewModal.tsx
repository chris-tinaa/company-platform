import { useEffect, useState } from "react";
import { Alert, Modal, Spin } from "antd";
import { api, getApiError } from "../../shared/api/http";

export default function PhotoPreviewModal({
  documentId,
  onClose,
}: {
  documentId: string | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!documentId) return;
    let active = true;
    let currentUrl = "";
    setUrl("");
    setError("");
    void api
      .get(`/documents/${documentId}/content`, { responseType: "blob" })
      .then((response) => {
        const blobUrl = URL.createObjectURL(response.data as Blob);
        currentUrl = blobUrl;
        if (active) setUrl(blobUrl);
        else URL.revokeObjectURL(blobUrl);
      })
      .catch((reason: unknown) => {
        if (active) setError(getApiError(reason));
      });
    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [documentId]);

  return (
    <Modal
      open={Boolean(documentId)}
      title="Bukti Foto Absensi"
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={600}
    >
      {error && <Alert type="error" message={error} />}
      {!error && !url && (
        <div className="photo-loading">
          <Spin />
        </div>
      )}
      {url && (
        <img src={url} alt="Bukti foto absensi" className="modal-photo" />
      )}
    </Modal>
  );
}

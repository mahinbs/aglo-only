import { UseFormRegister, FieldErrors } from "react-hook-form";
import { Upload, X, FileText } from "lucide-react";
import { useState, useEffect } from "react";

interface FileUploadProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  name: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>;
  setFile: (file: File | null) => void;
  file: File | null;
  handleRemoveFile: () => void;
  setImage: (url: string | null) => void;
  image: string | null;
}

const FileUpload = ({
  register,
  name,
  label,
  errors,
  setFile,
  file,
  handleRemoveFile,
  setImage,
  image,
}: FileUploadProps) => {
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setImage(URL.createObjectURL(uploadedFile));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const uploadedFile = e.dataTransfer.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setImage(URL.createObjectURL(uploadedFile));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  return (
    <div className="mb-6 space-y-2">
      <label className="block text-sm font-medium text-zinc-200">
        {label} <span className="text-red-500">*</span>
      </label>
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 ease-in-out ${
          dragActive
            ? "border-teal-500/50 bg-teal-500/10"
            : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900"
        } ${errors[name] && !file ? "border-red-500/50 bg-red-500/5" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="text-center">
          <input
            type="file"
            className="hidden"
            {...register(name, { required: "Please upload a file" })}
            id={name}
            onChange={handleFileChange}
            accept="image/*,.pdf"
          />
          {!image ? (
            <label htmlFor={name} className="cursor-pointer flex flex-col items-center gap-3">
              <div className="p-3 rounded-full bg-zinc-800/50 text-teal-400">
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-200">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-zinc-500">
                  SVG, PNG, JPG or PDF (max. 10MB)
                </p>
              </div>
            </label>
          ) : (
            <div className="relative group">
              <div className="relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950/50">
                {file?.type.startsWith('image/') ? (
                  <img
                    src={image}
                    alt="Uploaded file preview"
                    className="max-h-64 w-full object-contain mx-auto"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
                    <FileText className="w-12 h-12 mb-2" />
                    <span className="text-sm">{file?.name}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleRemoveFile();
                    }}
                    className="p-2 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-zinc-500 truncate max-w-xs mx-auto">
                {file?.name}
              </p>
            </div>
          )}
        </div>
      </div>

      {errors[name] && !file && (
        <p className="text-xs text-red-400 mt-1">
          {errors[name]?.message as string}
        </p>
      )}
    </div>
  );
};

export default FileUpload;

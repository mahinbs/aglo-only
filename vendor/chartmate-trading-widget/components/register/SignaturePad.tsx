import { UseFormRegister, UseFormSetValue } from "react-hook-form";
import SignatureCanvas from "react-signature-canvas";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>;
  clear: () => void;
  sigCanvas: React.RefObject<SignatureCanvas>;
}

const SignaturePad = ({ register, setValue, clear, sigCanvas }: SignaturePadProps) => {
  const save = () => {
    if (sigCanvas.current) {
      setValue("signature", sigCanvas.current.toDataURL());
    }
  };

  return (
    <div className="mb-6 space-y-2">
      <div className="flex justify-between items-center">
        <label className="block text-sm font-medium text-zinc-200">
          Signature <span className="text-red-500">*</span>
        </label>
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-teal-400 transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>
      <div className="relative border border-zinc-800 rounded-xl bg-zinc-900/50 p-4 shadow-sm hover:border-zinc-700 transition-colors">
        <SignatureCanvas
          ref={sigCanvas}
          canvasProps={{
            className: "w-full h-40 rounded-lg bg-white cursor-crosshair touch-none",
          }}
          penColor="black"
          dotSize={0.5}
          onEnd={save}
          velocityFilterWeight={0.7}
          minWidth={0.5}
          maxWidth={2.5}
        />
        <div className="absolute bottom-2 right-2 pointer-events-none opacity-50 text-[10px] text-zinc-500 font-mono">
          Sign above
        </div>
      </div>
    </div>
  );
};

export default SignaturePad;

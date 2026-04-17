import { useForm } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import Layout from "../components/landingpage/Layout";
import FileUpload from "../components/register/FileUpload";
import SignaturePad from "../components/register/SignaturePad";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface SignUpFormData {
  name: string;
  email: string;
  whatsapp: string;
  idProof: FileList;
  paymentId: string;
  paymentDate: string;
  signature: string;
  declaration: boolean;
  techProviderAcknowledge: boolean;
}

const RegisterPage = () => {
  const sigCanvas = useRef<SignatureCanvas>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    reset,
  } = useForm<SignUpFormData>();
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data: SignUpFormData) => {
    if (loading) return;
    setLoading(true);
    if (!data.signature) {
      alert("Please provide a signature");
      setLoading(false);
      return;
    }

    const formData = new FormData();

    const emailBody = `Name: ${data.name}\n\nEmail: ${data.email}\n\nPhone: ${data.whatsapp}\n\npaymentId: ${data.paymentId}\n\npaymentDate:\n${data.paymentDate}`;

    const signatureFile = dataURItoFile(data.signature, "signature.png");

    if (file) {
      formData.append("file", file);
    }
    if (signatureFile) {
      formData.append("file", signatureFile);
    }
    formData.append("body", emailBody);
    try {
      const response = await axios.post(
        "https://boostmysite-attachment-email-zeta.vercel.app/api/send-signup",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if ((response.data as any).success) {
        alert("Form submitted successfully!");
        reset();
        setFile(null);
        setImage(null);
        setLoading(false);
        clear();
        handleRemoveFile();
      } else {
        alert("Form submission failed!");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Failed to submit form. Please try again.");
      setLoading(false);
    }
  };

  const dataURItoFile = (dataURI: string, filename: string): File => {
    const byteString = atob(dataURI.split(",")[1]);
    const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }

    return new File([ab], filename, { type: mimeString });
  };

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      const firstErrorField = Object.keys(errors)[0];
      const errorElement = document.querySelector(
        `[name="${firstErrorField}"]`
      );

      if (errorElement) {
        errorElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [errors]);

  const clear = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear();
      setValue("signature", "");
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setImage(null);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500 selection:text-black pt-24 pb-16">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="mb-10 text-center space-y-4">
              <h1 className="text-4xl md:text-5xl font-bold text-white">
                Create Account
              </h1>
              <p className="text-zinc-400 text-lg">
                Complete the form below to get started with your premium trading journey.
              </p>
            </div>

            <Card className="bg-zinc-900/30 border-zinc-800 backdrop-blur-sm shadow-2xl shadow-teal-900/10">
              <CardContent className="p-6 md:p-8">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-200">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="text"
                      className="bg-zinc-950/50 border-zinc-800 focus:border-teal-500/50 focus:ring-teal-500/20 h-12"
                      placeholder="Enter your full name"
                      {...register("name", { required: true })}
                    />
                    {errors.name && (
                      <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
                        <AlertCircle className="w-3 h-3" /> This field is required
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-200">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="email"
                      className="bg-zinc-950/50 border-zinc-800 focus:border-teal-500/50 focus:ring-teal-500/20 h-12"
                      placeholder="Enter your email address"
                      {...register("email", {
                        required: true,
                        pattern: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      })}
                    />
                    {errors.email && (
                      <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
                        <AlertCircle className="w-3 h-3" /> Please enter a valid email
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-200">
                      WhatsApp Number <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="tel"
                      className="bg-zinc-950/50 border-zinc-800 focus:border-teal-500/50 focus:ring-teal-500/20 h-12"
                      placeholder="+1234567890"
                      {...register("whatsapp", {
                        required: true,
                        pattern: /^\+?[1-9]\d{1,14}$/,
                      })}
                    />
                    {errors.whatsapp && (
                      <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
                        <AlertCircle className="w-3 h-3" /> Please enter a valid WhatsApp number
                      </p>
                    )}
                  </div>

                  <div className="pt-2">
                    <FileUpload
                      register={register}
                      name="idProof"
                      label="ID Proof"
                      errors={errors}
                      file={file}
                      setFile={setFile}
                      handleRemoveFile={handleRemoveFile}
                      setImage={setImage}
                      image={image}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-zinc-200">
                        Payment ID <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="text"
                        className="bg-zinc-950/50 border-zinc-800 focus:border-teal-500/50 focus:ring-teal-500/20 h-12"
                        placeholder="Transaction ID"
                        {...register("paymentId", { required: true })}
                      />
                      {errors.paymentId && (
                        <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
                          <AlertCircle className="w-3 h-3" /> Payment ID is required
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-zinc-200">
                        Payment Date <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="date"
                        className="bg-zinc-950/50 border-zinc-800 focus:border-teal-500/50 focus:ring-teal-500/20 h-12 [color-scheme:dark]"
                        {...register("paymentDate", { required: true })}
                      />
                      {errors.paymentDate && (
                        <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
                          <AlertCircle className="w-3 h-3" /> Payment Date is required
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2">
                    <SignaturePad
                      register={register}
                      setValue={setValue}
                      clear={clear}
                      sigCanvas={sigCanvas}
                    />
                  </div>

                  <div className="flex items-start space-x-3 pt-2">
                    <Checkbox
                      id="declaration"
                      className="mt-1 border-zinc-600 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                      onCheckedChange={(checked) => setValue("declaration", checked === true)}
                      {...register("declaration", { required: true })}
                    />
                    <div className="space-y-1">
                      <label htmlFor="declaration" className="text-sm text-zinc-300 leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        I agree to the{" "}
                        <Link
                          to="/terms"
                          className="text-teal-400 hover:text-teal-300 underline underline-offset-4 transition-colors"
                        >
                          Terms & Conditions
                        </Link>
                      </label>
                      {errors.declaration && (
                        <p className="text-xs text-red-400 flex items-center gap-1.5">
                          <AlertCircle className="w-3 h-3" /> You must agree to the Terms and Conditions
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 pt-2">
                    <Checkbox
                      id="techProviderAcknowledge"
                      className="mt-1 border-zinc-600 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                      onCheckedChange={(checked) => setValue("techProviderAcknowledge", checked === true)}
                      {...register("techProviderAcknowledge", { required: true })}
                    />
                    <div className="space-y-1">
                      <label htmlFor="techProviderAcknowledge" className="text-sm text-zinc-300 leading-tight cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        I understand that this platform is only a technology provider and does not offer any investment advice or trading strategies.
                      </label>
                      {errors.techProviderAcknowledge && (
                        <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
                          <AlertCircle className="w-3 h-3" /> This acknowledgment is required
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-6">
                    <Button
                      disabled={loading}
                      type="submit"
                      className="w-full h-12 bg-teal-500 hover:bg-teal-400 text-black font-semibold text-lg rounded-xl shadow-[0_0_30px_rgba(20,184,166,0.3)] hover:shadow-[0_0_50px_rgba(20,184,166,0.5)] transition-all duration-300"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Submit Application
                          <CheckCircle2 className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default RegisterPage;

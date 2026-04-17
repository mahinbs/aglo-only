import { Navigate, useParams } from "react-router-dom";

/** Old URL `/predictions/:id/full` → same Results UI as live run */
export default function SavedAnalysisRedirect() {
  const { predictionId } = useParams<{ predictionId: string }>();
  if (!predictionId) return <Navigate to="/predictions" replace />;
  return <Navigate to={`/predict?saved=${predictionId}`} replace />;
}

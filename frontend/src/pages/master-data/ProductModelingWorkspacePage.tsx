import { Navigate, useParams, useSearchParams } from "react-router-dom";
export default function ProductModelingWorkspacePage() {
  const { productVersionId = "" } = useParams();
  const [params] = useSearchParams();
  const target = new URLSearchParams(params);
  target.set("productId", productVersionId);
  return <Navigate replace to={`/pack/manufacturing?${target.toString()}`} />;
}

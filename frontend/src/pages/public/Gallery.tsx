import { Navigate } from "react-router-dom";

// The public Gallery page was a placeholder, so it has been retired. Photo
// sharing is explained on the Features page; this keeps any old link or
// bookmark to /gallery working by sending visitors there.
export default function Gallery() {
  return <Navigate to="/features#photos" replace />;
}
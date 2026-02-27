import VerifyPage from "../page";

// Dynamic route: /verify/[objectId] renders the same verifier page
// The client-side component reads the objectId from window.location.pathname
export default function VerifyWithId() {
    return <VerifyPage />;
}

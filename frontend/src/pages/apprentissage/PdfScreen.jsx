import { useParams } from "react-router-dom";
import { dataMediaUrl } from "../../api/media";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { ChapitreLogo } from "../../components/ChapitreLogo";
import "../screens.css";

export default function PdfScreen() {
  const { chapId, code } = useParams();

  return (
    <section className="screen" style={{ minHeight: "auto" }}>
      <h1
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.15em",
        }}
      >
        <ChapitreLogo chapId={chapId} size="5.2em" style={{ marginInlineStart: 0 }} />
        <span>{displayLessonNumber(code)}</span>
      </h1>
      <iframe
        title={`PDF leçon ${displayLessonNumber(code)}`}
        src={`${dataMediaUrl(`pdfs/${code}.pdf`)}#page=1`}
        style={{ width: "100%", maxWidth: 800, height: "75vh", border: "1px solid var(--border)", borderRadius: 8 }}
      />
    </section>
  );
}

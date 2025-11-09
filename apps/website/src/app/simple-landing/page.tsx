import {
  CodeExamples,
  Features,
  Footer,
  Header,
  Hero,
  UseCases,
} from "@/components/wraps-marketing";

export default function SimpleLandingPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <Features />
        <CodeExamples />
        <UseCases />
      </main>
      <Footer />
    </div>
  );
}

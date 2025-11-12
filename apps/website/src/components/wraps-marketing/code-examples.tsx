"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

export function CodeExamples() {
  const [activeTab, setActiveTab] = useState<"with" | "without">("with");

  return (
    <section className="container pb-24">
      <div className="mx-auto max-w-[980px]">
        <h2 className="mb-4 font-bold text-3xl leading-tight tracking-tighter md:text-4xl">
          Developer-first
        </h2>
        <p className="mb-8 max-w-[600px] text-muted-foreground leading-relaxed">
          Move from AWS SDK complexity to simple, intuitive APIs with excellent
          TypeScript support and helpful error messages.
        </p>
        <div className="mb-4 flex gap-2">
          <button
            className={`rounded-md px-4 py-2 text-sm transition-colors ${
              activeTab === "with"
                ? "bg-secondary font-medium text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("with")}
          >
            With Wraps
          </button>
          <button
            className={`rounded-md px-4 py-2 text-sm transition-colors ${
              activeTab === "without"
                ? "bg-secondary font-medium text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("without")}
          >
            Without Wraps
          </button>
        </div>
        <Card className="relative overflow-hidden">
          <div className="bg-card p-6">
            <pre className="overflow-x-auto text-sm">
              <code className="font-mono">
                {activeTab === "with" ? (
                  <>
                    <span className="text-muted-foreground">1</span>{" "}
                    <span className="text-purple-400">import</span>{" "}
                    <span className="text-foreground">{"{ Wraps }"}</span>{" "}
                    <span className="text-purple-400">from</span>{" "}
                    <span className="text-green-400">
                      &quot;@wraps.dev/email&quot;
                    </span>
                    ;{"\n"}
                    <span className="text-muted-foreground">2</span>
                    {"\n"}
                    <span className="text-muted-foreground">3</span>{" "}
                    <span className="text-purple-400">const</span>{" "}
                    <span className="text-blue-400">wraps</span>{" "}
                    <span className="text-foreground">=</span>{" "}
                    <span className="text-purple-400">new</span>{" "}
                    <span className="text-yellow-400">Wraps</span>
                    <span className="text-foreground">{"();"}</span>
                    {"\n"}
                    <span className="text-muted-foreground">4</span>
                    {"\n"}
                    <span className="text-muted-foreground">5</span>{" "}
                    <span className="text-purple-400">const</span>{" "}
                    <span className="text-blue-400">result</span>{" "}
                    <span className="text-foreground">=</span>{" "}
                    <span className="text-purple-400">await</span>{" "}
                    <span className="text-blue-400">wraps</span>.
                    <span className="text-yellow-400">emails</span>.
                    <span className="text-yellow-400">send</span>
                    <span className="text-foreground">{"({"}</span>
                    {"\n"}
                    <span className="text-muted-foreground">6</span>{" "}
                    <span className="text-foreground"> from:</span>{" "}
                    <span className="text-green-400">
                      &quot;hello@yourapp.com&quot;
                    </span>
                    ,{"\n"}
                    <span className="text-muted-foreground">7</span>{" "}
                    <span className="text-foreground"> to:</span>{" "}
                    <span className="text-green-400">
                      &quot;user@example.com&quot;
                    </span>
                    ,{"\n"}
                    <span className="text-muted-foreground">8</span>{" "}
                    <span className="text-foreground"> subject:</span>{" "}
                    <span className="text-green-400">&quot;Welcome!&quot;</span>
                    ,{"\n"}
                    <span className="text-muted-foreground">9</span>{" "}
                    <span className="text-foreground"> html:</span>{" "}
                    <span className="text-green-400">
                      &quot;&lt;h1&gt;Hello&lt;/h1&gt;&quot;
                    </span>
                    ,{"\n"}
                    <span className="text-muted-foreground">10</span>{" "}
                    <span className="text-foreground">{"});"}</span>
                    {"\n"}
                    <span className="text-muted-foreground">11</span>
                    {"\n"}
                    <span className="text-muted-foreground">12</span>{" "}
                    <span className="text-purple-400">if</span>{" "}
                    <span className="text-foreground">
                      (result.success) {"{"}
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground">13</span>{" "}
                    <span className="text-foreground">
                      {"  "}console.
                      <span className="text-yellow-400">log</span>(
                      <span className="text-green-400">&quot;Sent!&quot;</span>
                      );
                    </span>
                    {"\n"}
                    <span className="text-muted-foreground">14</span>{" "}
                    <span className="text-foreground">{"}"}</span>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">1</span>{" "}
                    <span className="text-purple-400">import</span>{" "}
                    <span className="text-foreground">{"{ SESClient }"}</span>{" "}
                    <span className="text-purple-400">from</span>{" "}
                    <span className="text-green-400">
                      &quot;@aws-sdk/client-ses&quot;
                    </span>
                    ;{"\n"}
                    <span className="text-muted-foreground">2</span>
                    {"\n"}
                    <span className="text-muted-foreground">3</span>{" "}
                    <span className="text-purple-400">const</span>{" "}
                    <span className="text-blue-400">client</span>{" "}
                    <span className="text-foreground">=</span>{" "}
                    <span className="text-purple-400">new</span>{" "}
                    <span className="text-yellow-400">SESClient</span>
                    <span className="text-foreground">{"({"}</span>
                    {"\n"}
                    <span className="text-muted-foreground">4</span>{" "}
                    <span className="text-foreground"> region:</span>{" "}
                    <span className="text-green-400">
                      &quot;us-east-1&quot;
                    </span>
                    ,{"\n"}
                    <span className="text-muted-foreground">5</span>{" "}
                    <span className="text-foreground"> credentials:</span>{" "}
                    <span className="text-foreground">{"{"}</span>
                    {"\n"}
                    <span className="text-muted-foreground">6</span>{" "}
                    <span className="text-foreground">
                      {"    "}accessKeyId: process.env.AWS_ACCESS_KEY
                    </span>
                    ,{"\n"}
                    <span className="text-muted-foreground">7</span>{" "}
                    <span className="text-foreground">
                      {"    "}secretAccessKey: process.env.AWS_SECRET_KEY
                    </span>
                    ,{"\n"}
                    <span className="text-muted-foreground">8</span>{" "}
                    <span className="text-foreground">{"  },"}</span>
                    {"\n"}
                    <span className="text-muted-foreground">9</span>{" "}
                    <span className="text-foreground">{"});"}</span>
                    {"\n"}
                    <span className="text-muted-foreground">10</span>
                    {"\n"}
                    <span className="text-muted-foreground">11</span>{" "}
                    <span className="text-purple-400">const</span>{" "}
                    <span className="text-blue-400">params</span>{" "}
                    <span className="text-foreground">=</span>{" "}
                    <span className="text-foreground">{"{"}</span>
                    {"\n"}
                    <span className="text-muted-foreground">12</span>{" "}
                    <span className="text-foreground"> Source:</span>{" "}
                    <span className="text-green-400">
                      &quot;noreply@example.com&quot;
                    </span>
                    ,{"\n"}
                    <span className="text-muted-foreground">13</span>{" "}
                    <span className="text-foreground"> Destination:</span>{" "}
                    <span className="text-foreground">
                      {"{ ToAddresses: ["}
                    </span>
                    <span className="text-green-400">
                      &quot;user@example.com&quot;
                    </span>
                    <span className="text-foreground">{"] },"}</span>
                    {"\n"}
                    <span className="text-muted-foreground">14</span>{" "}
                    <span className="text-foreground">{"  // ..."}</span>
                  </>
                )}
              </code>
            </pre>
          </div>
        </Card>
      </div>
    </section>
  );
}

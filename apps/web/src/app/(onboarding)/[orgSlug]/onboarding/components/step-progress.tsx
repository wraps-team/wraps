import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StepProgressProps = {
  steps: string[];
  currentStep: number;
};

export function StepProgress({ steps, currentStep }: StepProgressProps) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <li
              className={cn(
                "relative flex flex-1",
                index !== steps.length - 1 && "pr-8 sm:pr-20"
              )}
              key={step}
            >
              {/* Connector line */}
              {index !== steps.length - 1 && (
                <div
                  aria-hidden="true"
                  className="absolute top-4 right-[-1rem] left-[calc(50%+1rem)] h-0.5 sm:right-[-2rem]"
                >
                  <div
                    className={cn(
                      "h-full transition-colors",
                      isCompleted ? "bg-primary" : "bg-muted"
                    )}
                  />
                </div>
              )}

              {/* Step */}
              <div className="group relative flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary bg-background text-primary",
                    !(isCompleted || isCurrent) &&
                      "border-muted bg-background text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">{stepNumber}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 font-medium text-xs transition-colors",
                    isCurrent && "text-foreground",
                    !isCurrent && "text-muted-foreground"
                  )}
                >
                  {step}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

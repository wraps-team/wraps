"use client"

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useState } from 'react'

const plans = [
  {
    name: 'Free',
    description: 'Perfect for side projects and learning',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      'Local console dashboard',
      'All services (Email, SMS, Queues, IoT)',
      'Unlimited team members (local use)',
      '1 AWS account',
      'Community support (GitHub)',
      'Forever free'
    ],
    cta: 'Get Started',
    popular: false
  },
  {
    name: 'Starter',
    description: 'Solo developers and small startups',
    monthlyPrice: 10,
    yearlyPrice: 8.33,
    features: [
      'Hosted dashboard',
      'Unlimited templates',
      'Batch sending (100 recipients)',
      'Email & SMS history (60 days)',
      'Up to 3 queues, 10 IoT devices',
      '1 AWS account',
      'Email support (48hr)'
    ],
    cta: 'Start Free Trial',
    popular: true,
    includesPrevious: 'Everything in Free, plus'
  },
  {
    name: 'Pro',
    description: 'Small teams and growing businesses',
    monthlyPrice: 49,
    yearlyPrice: 40.83,
    features: [
      'Everything in Starter',
      'Unlimited batch recipients',
      'A/B testing',
      'Advanced analytics',
      '3 AWS accounts (dev, staging, prod)',
      'Team collaboration (up to 10 members)',
      'Email support (24hr)'
    ],
    cta: 'Start Free Trial',
    popular: false,
    includesPrevious: ''
  },
  {
    name: 'Enterprise',
    description: 'Large teams and regulated industries',
    monthlyPrice: 399,
    yearlyPrice: 332.50,
    features: [
      'Everything in Pro',
      'Unlimited AWS accounts',
      'SSO/SAML integration',
      'Audit logs (unlimited retention)',
      'Approval workflows',
      'SOC 2 compliance',
      'Dedicated support (4hr SLA)'
    ],
    cta: 'Contact Sales',
    popular: false,
    includesPrevious: ''
  }
]

export function PricingSection() {
  const [isYearly, setIsYearly] = useState(false)

  return (
    <section id="pricing" className="py-24 sm:py-32 bg-muted/40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-12">
          <Badge variant="outline" className="mb-4">Simple Pricing</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            One price, all services
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Start free with the local console. Upgrade to hosted dashboard when you're ready.
            All services included—no additional fees as we add SMS, queues, and IoT.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center mb-2">
            <ToggleGroup
              type="single"
              value={isYearly ? "yearly" : "monthly"}
              onValueChange={(value) => setIsYearly(value === "yearly")}
              className="bg-secondary text-secondary-foreground border-none rounded-full p-1 cursor-pointer shadow-none"
            >
              <ToggleGroupItem
                value="monthly"
                className="data-[state=on]:bg-background data-[state=on]:border-border border-transparent border px-6 !rounded-full data-[state=on]:text-foreground hover:bg-transparent cursor-pointer transition-colors"
              >
                Monthly
              </ToggleGroupItem>
              <ToggleGroupItem
                value="yearly"
                className="data-[state=on]:bg-background data-[state=on]:border-border border-transparent border px-6 !rounded-full data-[state=on]:text-foreground hover:bg-transparent cursor-pointer transition-colors"
              >
                Annually
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-semibold">Save 20%</span> On Annual Billing
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="mx-auto max-w-7xl">
          <div className="rounded-xl border">
            <div className="grid md:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan, index) => (
                <div
                  key={index}
                  className={`p-8 grid grid-rows-subgrid row-span-4 gap-6 ${
                    plan.popular
                      ? 'my-2 mx-4 rounded-xl bg-card border-transparent shadow-xl ring-1 ring-foreground/10 backdrop-blur'
                      : ''
                  }`}
                >
                  {/* Plan Header */}
                  <div>
                    <div className="text-lg font-medium tracking-tight mb-2">{plan.name}</div>
                    <div className="text-muted-foreground text-balance text-sm">{plan.description}</div>
                  </div>

                  {/* Pricing */}
                  <div>
                    <div className="text-4xl font-bold mb-1">
                      {plan.name === 'Free' ? (
                        '$0'
                      ) : (
                        `$${(isYearly ? plan.yearlyPrice : plan.monthlyPrice).toFixed(0)}`
                      )}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {plan.name === 'Free' ? 'Forever' : isYearly ? 'Per month, billed annually' : 'Per month'}
                    </div>
                  </div>

                  {/* CTA Button */}
                  <div>
                    <Button
                      className={`w-full cursor-pointer my-2 ${
                        plan.popular
                          ? 'shadow-md border-[0.5px] border-white/25 shadow-black/20 bg-primary ring-1 ring-primary/15 text-primary-foreground hover:bg-primary/90'
                          : 'shadow-sm shadow-black/15 border border-transparent bg-background ring-1 ring-foreground/10 hover:bg-muted/50'
                      }`}
                      variant={plan.popular ? 'default' : 'secondary'}
                    >
                      {plan.cta}
                    </Button>
                  </div>

                  {/* Features */}
                  <div>
                    <ul role="list" className="space-y-3 text-sm">
                      {plan.includesPrevious && (
                        <li className="flex items-center gap-3 font-medium">
                          {plan.includesPrevious}:
                        </li>
                      )}
                      {plan.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-center gap-3">
                          <Check className="text-muted-foreground size-4 flex-shrink-0" strokeWidth={2.5} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AWS Cost Note */}
        <div className="mt-16 text-center max-w-2xl mx-auto">
          <p className="text-muted-foreground mb-4">
            <strong className="text-foreground">Plus AWS costs:</strong> You pay AWS directly for infrastructure usage.
            Most users pay $10-100/month to AWS depending on volume.
          </p>
          <p className="text-sm text-muted-foreground">
            Questions? {' '}
            <Button variant="link" className="p-0 h-auto cursor-pointer" asChild>
              <a href="#contact">
                Contact our team
              </a>
            </Button>
          </p>
        </div>
      </div>
    </section>
  )
}

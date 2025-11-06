"use client"

import {
  Shield,
  Zap,
  DollarSign,
  ArrowRight,
  Cloud,
  Lock,
  Gauge,
  Layers,
  Terminal
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Image3D } from '@/components/image-3d'

const mainFeatures = [
  {
    icon: Lock,
    title: 'Zero Vendor Lock-In',
    description: 'Infrastructure stays in your AWS account. Stop paying us, keep using AWS.'
  },
  {
    icon: DollarSign,
    title: 'AWS Pricing',
    description: 'Pay AWS directly. 10-100x cheaper than SaaS alternatives at scale.'
  },
  {
    icon: Zap,
    title: '30-Second Setup',
    description: 'Deploy production-ready infrastructure in one command. No 2-hour AWS tutorials.'
  },
  {
    icon: Layers,
    title: 'Multi-Service Platform',
    description: 'Email, SMS, queues, and IoT. One dashboard to rule them all.'
  }
]

const secondaryFeatures = [
  {
    icon: Gauge,
    title: 'Resend-like DX',
    description: 'Beautiful APIs and dashboards that just work. AWS power, SaaS experience.'
  },
  {
    icon: Shield,
    title: 'Zero Stored Credentials',
    description: 'OIDC and IAM roles mean we never see your AWS keys. Maximum security.'
  },
  {
    icon: Terminal,
    title: 'Forever Free Local Console',
    description: 'Full-featured local dashboard. No credit card, no limits, forever.'
  },
  {
    icon: Cloud,
    title: 'Infrastructure Ownership',
    description: 'You own it, you control it, your data never leaves your AWS account.'
  }
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">Why BYO?</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            The Best of AWS and SaaS, None of the Downsides
          </h2>
          <p className="text-lg text-muted-foreground">
            Get Resend-like developer experience with AWS pricing. No vendor lock-in, no stored credentials,
            no surprises. Your infrastructure, your control, your data.
          </p>
        </div>

        {/* First Feature Section */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16 mb-24">
          {/* Left Image */}
          <Image3D
            lightSrc="feature-1-light.png"
            darkSrc="feature-1-dark.png"
            alt="Analytics dashboard"
            direction="left"
          />
          {/* Right Content */}
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Own your infrastructure, keep your data
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                BYO deploys directly to your AWS account. You pay AWS directly, you own the infrastructure,
                and your data never leaves your control. Stop worrying about vendor lock-in.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {mainFeatures.map((feature, index) => (
                <li key={index} className="group hover:bg-accent/5 flex items-start gap-3 p-2 rounded-lg transition-colors">
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-foreground font-medium">{feature.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-4 pe-4 pt-2">
              <Button size="lg" className="cursor-pointer">
                <a href="#pricing" className='flex items-center'>
                  Get Started Free
                  <ArrowRight className="ms-2 size-4" aria-hidden="true" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="cursor-pointer">
                <a href="https://github.com/yourusername/byo" target="_blank" rel="noopener noreferrer">
                  View on GitHub
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Second Feature Section - Flipped Layout */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          {/* Left Content */}
          <div className="space-y-6 order-2 lg:order-1">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Beautiful DX meets maximum security
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                Clean APIs, gorgeous dashboards, and one-command deployments. All while using OIDC and IAM roles
                so we never touch your AWS credentials. The security of self-hosted, the UX of SaaS.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {secondaryFeatures.map((feature, index) => (
                <li key={index} className="group hover:bg-accent/5 flex items-start gap-3 p-2 rounded-lg transition-colors">
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-foreground font-medium">{feature.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-4 pe-4 pt-2">
              <Button size="lg" className="cursor-pointer">
                <a href="/docs" className='flex items-center'>
                  Read the Docs
                  <ArrowRight className="ms-2 size-4" aria-hidden="true" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="cursor-pointer">
                <a href="#pricing">
                  View Pricing
                </a>
              </Button>
            </div>
          </div>

          {/* Right Image */}
          <Image3D
            lightSrc="feature-2-light.png"
            darkSrc="feature-2-dark.png"
            alt="Performance dashboard"
            direction="right"
            className="order-1 lg:order-2"
          />
        </div>
      </div>
    </section>
  )
}

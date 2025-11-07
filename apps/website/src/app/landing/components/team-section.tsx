"use client";

import { Github, Globe, Linkedin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardDecorator } from "@/components/ui/card-decorator";

const team = [
  {
    id: 1,
    name: "Alexandra Chen",
    role: "Founder & CEO",
    description:
      "Former co-founder of TechFlow. Early staff at Microsoft and Google.",
    image:
      "https://images.unsplash.com/photo-1494790108755-2616b612b786?q=60&w=150&auto=format&fit=crop",
    fallback: "AC",
    social: {
      linkedin: "#",
      github: "#",
      website: "#",
    },
  },
  {
    id: 2,
    name: "Marcus Rodriguez",
    role: "Engineering Manager",
    description: "Lead engineering teams at Stripe, Discord, and Meta Labs.",
    image:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=60&w=150&auto=format&fit=crop",
    fallback: "MR",
    social: {
      linkedin: "#",
      github: "#",
      website: "#",
    },
  },
  {
    id: 3,
    name: "Sophie Laurent",
    role: "Product Manager",
    description: "Former PM for Linear, Lambda School, and On Deck.",
    image:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=60&w=150&auto=format&fit=crop",
    fallback: "SL",
    social: {
      linkedin: "#",
      github: "#",
      website: "#",
    },
  },
  {
    id: 4,
    name: "David Kim",
    role: "Frontend Developer",
    description: "Former frontend dev for Linear, Coinbase, and PostScript.",
    image:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=60&w=150&auto=format&fit=crop",
    fallback: "DK",
    social: {
      linkedin: "#",
      github: "#",
      website: "#",
    },
  },
  {
    id: 5,
    name: "Emma Thompson",
    role: "Backend Developer",
    description: "Lead backend dev at Clearbit. Former Clearbit and Loom.",
    image:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=60&w=150&auto=format&fit=crop",
    fallback: "ET",
    social: {
      linkedin: "#",
      github: "#",
      website: "#",
    },
  },
  {
    id: 6,
    name: "Ryan Mitchell",
    role: "Product Designer",
    description:
      "Founding design team at Figma. Former Pleo, Stripe, and Tile.",
    image:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=60&w=150&auto=format&fit=crop",
    fallback: "RM",
    social: {
      linkedin: "#",
      github: "#",
      website: "#",
    },
  },
  {
    id: 7,
    name: "James Anderson",
    role: "UX Researcher",
    description:
      "Lead user research for Slack. Contractor for Netflix and Udacity.",
    image:
      "https://images.unsplash.com/photo-1566492031773-4f4e44671d66?q=60&w=150&auto=format&fit=crop",
    fallback: "JA",
    social: {
      linkedin: "#",
      github: "#",
      website: "#",
    },
  },
  {
    id: 8,
    name: "Isabella Garcia",
    role: "Customer Success",
    description: "Lead CX at Wealthsimple. Former PagerDuty and Squreen.",
    image:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=60&w=150&auto=format&fit=crop",
    fallback: "IG",
    social: {
      linkedin: "#",
      github: "#",
      website: "#",
    },
  },
];

export function TeamSection() {
  return (
    <section className="py-24 sm:py-32" id="team">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-4xl text-center">
          <Badge className="mb-4" variant="outline">
            Our Team
          </Badge>
          <h2 className="mb-6 font-bold text-3xl tracking-tight sm:text-4xl">
            Meet our team
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            We are a passionate team of innovators, builders, and
            problem-solvers dedicated to creating exceptional digital
            experiences that make a difference.
          </p>
        </div>

        {/* Team Grid */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-4">
          {team.map((member) => (
            <Card className="py-2 shadow-xs" key={member.id}>
              <CardContent className="p-4">
                <div className="text-center">
                  {/* Avatar */}
                  <div className="mb-4 flex justify-center">
                    <CardDecorator>
                      <Avatar className="h-24 w-24 border shadow-lg">
                        <AvatarImage
                          alt={member.name}
                          className="object-cover"
                          src={member.image}
                        />
                        <AvatarFallback className="font-semibold text-lg">
                          {member.fallback}
                        </AvatarFallback>
                      </Avatar>
                    </CardDecorator>
                  </div>

                  {/* Name and Role */}
                  <h3 className="mb-1 font-semibold text-foreground text-lg">
                    {member.name}
                  </h3>
                  <p className="mb-3 font-medium text-primary text-sm">
                    {member.role}
                  </p>

                  {/* Description */}
                  <p className="mb-4 text-muted-foreground text-sm leading-relaxed">
                    {member.description}
                  </p>

                  {/* Social Links */}
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      asChild
                      className="h-8 w-8 cursor-pointer hover:text-primary"
                      size="icon"
                      variant="ghost"
                    >
                      <a
                        aria-label={`${member.name} LinkedIn`}
                        href={member.social.linkedin}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Linkedin className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      asChild
                      className="h-8 w-8 cursor-pointer hover:text-primary"
                      size="icon"
                      variant="ghost"
                    >
                      <a
                        aria-label={`${member.name} GitHub`}
                        href={member.social.github}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Github className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      asChild
                      className="h-8 w-8 cursor-pointer hover:text-primary"
                      size="icon"
                      variant="ghost"
                    >
                      <a
                        aria-label={`${member.name} Website`}
                        href={member.social.website}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Globe className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

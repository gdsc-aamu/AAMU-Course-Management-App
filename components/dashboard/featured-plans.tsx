"use client"

import { Sparkles, BookOpen, GraduationCap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { featuredPlanTemplates } from "@/lib/data"

const icons = [GraduationCap, Sparkles, BookOpen]

export function FeaturedPlans() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Featured Plans</h2>
        <Badge variant="secondary" className="text-xs">
          <Sparkles className="h-3 w-3 mr-1" />
          AI Generated
        </Badge>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featuredPlanTemplates.map((template, index) => {
          const Icon = icons[index % icons.length]
          return (
            <Card 
              key={template.id}
              className="group cursor-pointer overflow-hidden border-dashed transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {template.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {template.description}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{template.courses} courses</span>
                      <span className="text-border">•</span>
                      <span>{template.credits} credits</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

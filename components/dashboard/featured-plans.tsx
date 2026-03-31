"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { featuredPlanTemplates } from "@/lib/data"

export function FeaturedPlans() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Featured Plans</h2>
        <Badge variant="secondary" className="text-xs">AI Generated</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featuredPlanTemplates.map((template) => (
          <Card
            key={template.id}
            className="group cursor-pointer overflow-hidden border-dashed transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
          >
            <CardContent className="p-4">
              <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                {template.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {template.description}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{template.courses} courses</span>
                <span className="text-border">•</span>
                <span>{template.credits} credits</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

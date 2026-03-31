"use client"

import { useState, useEffect, useCallback } from "react"
import type { Plan } from "@/lib/types"
import { mockPlans } from "@/lib/data"

const STORAGE_KEY = "ontrack-plans"

export function usePlans() {
  // Initialize with mockPlans to avoid hydration mismatch
  const [plans, setPlans] = useState<Plan[]>(mockPlans)
  const [isLoading, setIsLoading] = useState(true)
  const [hasMounted, setHasMounted] = useState(false)

  // Load plans from localStorage on mount
  useEffect(() => {
    setHasMounted(true)
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setPlans(JSON.parse(stored))
      } catch {
        setPlans(mockPlans)
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockPlans))
    }
    setIsLoading(false)
  }, [])

  // Save plans to localStorage whenever they change
  const savePlans = useCallback((newPlans: Plan[]) => {
    setPlans(newPlans)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newPlans))
  }, [])

  const createPlan = useCallback((name: string, semester: string): Plan => {
    const newPlan: Plan = {
      id: `plan-${Date.now()}`,
      name,
      semester,
      courses: [],
      starred: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    savePlans([...plans, newPlan])
    return newPlan
  }, [plans, savePlans])

  const updatePlan = useCallback((id: string, updates: Partial<Plan>) => {
    const newPlans = plans.map((plan) =>
      plan.id === id
        ? { ...plan, ...updates, updatedAt: new Date().toISOString() }
        : plan
    )
    savePlans(newPlans)
  }, [plans, savePlans])

  const deletePlan = useCallback((id: string) => {
    savePlans(plans.filter((plan) => plan.id !== id))
  }, [plans, savePlans])

  const toggleStarred = useCallback((id: string) => {
    const newPlans = plans.map((plan) =>
      plan.id === id
        ? { ...plan, starred: !plan.starred, updatedAt: new Date().toISOString() }
        : plan
    )
    savePlans(newPlans)
  }, [plans, savePlans])

  const duplicatePlan = useCallback((id: string): Plan | null => {
    const planToCopy = plans.find((plan) => plan.id === id)
    if (!planToCopy) return null
    
    const newPlan: Plan = {
      ...planToCopy,
      id: `plan-${Date.now()}`,
      name: `${planToCopy.name} (Copy)`,
      starred: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    savePlans([...plans, newPlan])
    return newPlan
  }, [plans, savePlans])

  const getPlan = useCallback((id: string): Plan | undefined => {
    return plans.find((plan) => plan.id === id)
  }, [plans])

  const addCourseToPlan = useCallback((planId: string, courseId: string) => {
    const plan = plans.find((p) => p.id === planId)
    if (!plan || plan.courses.includes(courseId)) return
    
    updatePlan(planId, { courses: [...plan.courses, courseId] })
  }, [plans, updatePlan])

  const removeCourseFromPlan = useCallback((planId: string, courseId: string) => {
    const plan = plans.find((p) => p.id === planId)
    if (!plan) return
    
    updatePlan(planId, { courses: plan.courses.filter((id) => id !== courseId) })
  }, [plans, updatePlan])

  return {
    plans,
    isLoading,
    createPlan,
    updatePlan,
    deletePlan,
    toggleStarred,
    duplicatePlan,
    getPlan,
    addCourseToPlan,
    removeCourseFromPlan,
  }
}

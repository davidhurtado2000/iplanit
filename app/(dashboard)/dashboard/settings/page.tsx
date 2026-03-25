'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { createClient } from '@/lib/supabase/client'
import {
  User,
  Building2,
  Clock,
  Bell,
  CreditCard,
  Shield,
  Globe,
  Save,
  Crown,
  Check,
  Loader2,
  Plus,
} from 'lucide-react'

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

const TIMEZONES = [
  { value: 'America/Lima', label: 'Lima, Peru (GMT-5)' },
  { value: 'America/Denver', label: 'Denver, Colorado (GMT-7/6)' },
  { value: 'America/New_York', label: 'New York (GMT-5/4)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8/7)' },
  { value: 'America/Mexico_City', label: 'Ciudad de Mexico (GMT-6)' },
  { value: 'America/Bogota', label: 'Bogota, Colombia (GMT-5)' },
]

const DEFAULT_BUSINESS_HOURS = [
  { dayOfWeek: 'monday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'wednesday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'thursday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'friday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'saturday', startTime: '09:00', endTime: '14:00', isOpen: true },
  { dayOfWeek: 'sunday', startTime: '09:00', endTime: '14:00', isOpen: false },
]

export default function SettingsPage() {
  const { user, profile: authProfile, loading: authLoading, refreshProfile } = useAuth()
  const { businesses, loading: businessLoading } = useBusinesses()
  const { language, setLanguage, t } = useLanguage()
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false)
  const supabase = createClient()

  const currentBusiness = businesses?.[0]

  // DAYS computed from translations so they update when language changes
  const DAYS: { value: DayOfWeek; label: string }[] = [
    { value: 'monday', label: t.settings.days.monday },
    { value: 'tuesday', label: t.settings.days.tuesday },
    { value: 'wednesday', label: t.settings.days.wednesday },
    { value: 'thursday', label: t.settings.days.thursday },
    { value: 'friday', label: t.settings.days.friday },
    { value: 'saturday', label: t.settings.days.saturday },
    { value: 'sunday', label: t.settings.days.sunday },
  ]

  // Profile State
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    language: language,
  })

  // Business State
  const [business, setBusiness] = useState({
    name: '',
    timezone: 'America/Lima',
    address: '',
    phone: '',
    email: '',
  })

  // Business Hours State
  const [businessHours, setBusinessHours] = useState(DEFAULT_BUSINESS_HOURS)

  // Notifications State
  const [notifications, setNotifications] = useState({
    emailConfirmations: true,
    emailReminders: true,
    emailCancellations: true,
    reminderHours: 24,
  })

  // Initialize form with user/business data
  useEffect(() => {
    if (authProfile) {
      setProfileForm({
        name: authProfile.full_name || '',
        email: authProfile.email || '',
        language,
      })
    } else if (user) {
      setProfileForm({
        name: user.user_metadata?.full_name || '',
        email: user.email || '',
        language,
      })
    }

    if (currentBusiness) {
      setBusiness({
        name: currentBusiness.name,
        timezone: currentBusiness.timezone,
        address: '',
        phone: '',
        email: '',
      })
    }
  }, [authProfile, user, currentBusiness])

  const handleCreateBusiness = async () => {
    if (!user || !business.name) return

    setIsCreatingBusiness(true)
    try {
      const slug = business.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const { error } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name: business.name,
          slug: slug,
          timezone: business.timezone,
        })

      if (error) throw error
      window.location.reload()
    } catch (err) {
      console.error('[v0] Error creating business:', err)
    } finally {
      setIsCreatingBusiness(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      if (user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ full_name: profileForm.name })
          .eq('id', user.id)
        if (profileError) throw profileError
      }

      if (currentBusiness) {
        const { error: bizError } = await supabase
          .from('businesses')
          .update({
            name: business.name,
            timezone: business.timezone,
          })
          .eq('id', currentBusiness.id)
        if (bizError) throw bizError
      }

      // Apply language change immediately
      setLanguage(profileForm.language)
      await refreshProfile()

      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      console.error('[v0] Error saving settings:', err)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    } finally {
      setIsSaving(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const updateBusinessHour = (
    dayOfWeek: DayOfWeek,
    field: 'startTime' | 'endTime' | 'isOpen',
    value: string | boolean
  ) => {
    setBusinessHours(
      businessHours.map((h) =>
        h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
      )
    )
  }

  return (
    <div className="space-y-6">
      {authLoading || businessLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.settings.title}</h1>
        <p className="text-muted-foreground">{t.settings.subtitle}</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-muted/50 p-2 sm:grid-cols-4 lg:w-auto">
          <TabsTrigger
            value="profile"
            className="flex-col gap-1 py-3 data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:py-2"
          >
            <User className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{t.settings.profileTab}</span>
          </TabsTrigger>
          <TabsTrigger
            value="business"
            className="flex-col gap-1 py-3 data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:py-2"
          >
            <Building2 className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{t.settings.businessTab}</span>
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="flex-col gap-1 py-3 data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:py-2"
          >
            <Bell className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{t.settings.notificationsTab}</span>
          </TabsTrigger>
          <TabsTrigger
            value="plan"
            className="flex-col gap-1 py-3 data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:py-2"
          >
            <CreditCard className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{t.settings.planTab}</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.profileTitle}</CardTitle>
              <CardDescription>{t.settings.profileDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="text-xl">
                    {getInitials(profileForm.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline" size="sm">
                    {t.settings.changePhoto}
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.settings.photoHint}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">{t.settings.fullName}</Label>
                  <Input
                    id="profile-name"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-email">{t.settings.emailLabel}</Label>
                  <Input
                    id="profile-email"
                    type="email"
                    value={profileForm.email}
                    disabled
                    placeholder="tu@email.com"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.settings.emailHint}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-language">{t.language.label}</Label>
                <Select
                  value={profileForm.language}
                  onValueChange={(value) => setProfileForm({ ...profileForm, language: value as 'es' | 'en' })}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">{t.language.es}</SelectItem>
                    <SelectItem value="en">{t.language.en}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="flex items-center gap-2 font-medium">
                  <Shield className="h-4 w-4" />
                  {t.settings.securityTitle}
                </h4>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button variant="outline">{t.settings.changePassword}</Button>
                  <p className="text-sm text-muted-foreground">
                    {t.settings.lastUpdated}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                  {isSaving
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : saveStatus === 'success'
                      ? <Check className="h-4 w-4" />
                      : <Save className="h-4 w-4" />}
                  {t.saveChanges}
                </Button>
                {saveStatus === 'success' && (
                  <p className="text-sm text-green-600">{t.changesSaved}</p>
                )}
                {saveStatus === 'error' && (
                  <p className="text-sm text-destructive">{t.saveError}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business Tab */}
        <TabsContent value="business" className="space-y-6">
          {currentBusiness ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t.settings.businessTitle}</CardTitle>
                  <CardDescription>{t.settings.businessDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="business-name">{t.settings.businessName}</Label>
                      <Input
                        id="business-name"
                        value={business.name}
                        onChange={(e) => setBusiness({ ...business, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-timezone">{t.settings.timezone}</Label>
                      <Select
                        value={business.timezone}
                        onValueChange={(value) => setBusiness({ ...business, timezone: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-address">{t.settings.address}</Label>
                    <Input
                      id="business-address"
                      value={business.address}
                      onChange={(e) => setBusiness({ ...business, address: e.target.value })}
                      placeholder={t.settings.addressPlaceholder}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="business-phone">{t.settings.phone}</Label>
                      <Input
                        id="business-phone"
                        value={business.phone}
                        onChange={(e) => setBusiness({ ...business, phone: e.target.value })}
                        placeholder={t.settings.phonePlaceholder}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-email">{t.settings.contactEmail}</Label>
                      <Input
                        id="business-email"
                        type="email"
                        value={business.email}
                        onChange={(e) => setBusiness({ ...business, email: e.target.value })}
                        placeholder={t.settings.contactEmailPlaceholder}
                      />
                    </div>
                  </div>

                  <Separator />

                  <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Save className="h-4 w-4" />
                    {t.saveChanges}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t.settings.hoursTitle}
                  </CardTitle>
                  <CardDescription>{t.settings.hoursDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {DAYS.map((day) => {
                      const hours = businessHours.find((h) => h.dayOfWeek === day.value)
                      if (!hours) return null
                      return (
                        <div
                          key={day.value}
                          className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                        >
                          <div className="flex w-28 items-center justify-between sm:justify-start">
                            <span className="text-sm font-medium">{day.label}</span>
                            <Switch
                              checked={hours.isOpen}
                              onCheckedChange={(checked) =>
                                updateBusinessHour(day.value, 'isOpen', checked)
                              }
                              className="sm:ml-4"
                            />
                          </div>
                          {hours.isOpen && (
                            <div className="flex flex-1 items-center gap-2">
                              <Input
                                type="time"
                                value={hours.startTime}
                                onChange={(e) =>
                                  updateBusinessHour(day.value, 'startTime', e.target.value)
                                }
                                className="w-full sm:w-auto"
                              />
                              <span className="text-muted-foreground">{t.settings.to}</span>
                              <Input
                                type="time"
                                value={hours.endTime}
                                onChange={(e) =>
                                  updateBusinessHour(day.value, 'endTime', e.target.value)
                                }
                                className="w-full sm:w-auto"
                              />
                            </div>
                          )}
                          {!hours.isOpen && (
                            <span className="text-sm text-muted-foreground">{t.settings.closed}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t.settings.createBusinessTitle}</CardTitle>
                <CardDescription>{t.settings.createBusinessDesc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="new-biz-name">{t.settings.businessName}</Label>
                  <Input
                    id="new-biz-name"
                    value={business.name}
                    onChange={(e) => setBusiness({ ...business, name: e.target.value })}
                    placeholder="Ej: Mi Clínica Dental"
                  />
                </div>

                <div>
                  <Label htmlFor="new-timezone">{t.settings.timezone}</Label>
                  <Select
                    value={business.timezone}
                    onValueChange={(value) => setBusiness({ ...business, timezone: value })}
                  >
                    <SelectTrigger id="new-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleCreateBusiness}
                  disabled={isCreatingBusiness || !business.name}
                  className="gap-2"
                >
                  {isCreatingBusiness && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Plus className="h-4 w-4" />
                  {t.settings.createBusinessBtn}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.notifTitle}</CardTitle>
              <CardDescription>{t.settings.notifDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.settings.confirmations}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t.settings.confirmationsDesc}
                  </p>
                </div>
                <Switch
                  checked={notifications.emailConfirmations}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, emailConfirmations: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.settings.reminders}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t.settings.remindersDesc}
                  </p>
                </div>
                <Switch
                  checked={notifications.emailReminders}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, emailReminders: checked })
                  }
                />
              </div>

              {notifications.emailReminders && (
                <div className="ml-4 space-y-2 border-l-2 pl-4">
                  <Label>{t.settings.reminderTiming}</Label>
                  <Select
                    value={String(notifications.reminderHours)}
                    onValueChange={(value) =>
                      setNotifications({ ...notifications, reminderHours: parseInt(value) })
                    }
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t.settings.reminderH1}</SelectItem>
                      <SelectItem value="2">{t.settings.reminderH2}</SelectItem>
                      <SelectItem value="24">{t.settings.reminderH24}</SelectItem>
                      <SelectItem value="48">{t.settings.reminderH48}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.settings.cancellations}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t.settings.cancellationsDesc}
                  </p>
                </div>
                <Switch
                  checked={notifications.emailCancellations}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, emailCancellations: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plan Tab */}
        <TabsContent value="plan" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.planTitle}</CardTitle>
              <CardDescription>
                {authProfile?.plan === 'premium'
                  ? t.settings.premiumPlanDesc
                  : t.settings.freePlanDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <Crown className="h-8 w-8 text-amber-500" />
                  <div>
                    <p className="font-semibold">
                      {authProfile?.plan === 'premium'
                        ? t.settings.premiumPlanName
                        : t.settings.freePlanName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {authProfile?.plan === 'premium'
                        ? t.settings.premiumFeatures
                        : t.settings.freeFeatures}
                    </p>
                  </div>
                </div>
                {authProfile?.plan === 'premium' ? (
                  <Badge>
                    <Check className="mr-1 h-3 w-3" />
                    {t.settings.activeStatus}
                  </Badge>
                ) : (
                  <Button>{t.settings.upgradePremium}</Button>
                )}
              </div>

              {authProfile?.plan === 'free' && (
                <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Crown className="h-5 w-5 text-amber-500" />
                      {t.settings.premiumFeaturesTitle}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {t.settings.premiumFeaturesList.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-amber-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
        </>
      )}
    </div>
  )
}

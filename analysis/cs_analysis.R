# Fit quantile regression to critical speed and race performance data
# John J Davis - RunningWritings.com

library(tidyverse)
library(ggridges)
library(viridis)
library(mgcv)
library(gratia)
library(qgam)
library(jsonlite)

df <- read_csv("hs_college_track_times.csv") %>% 
  mutate(speed_m_s = event_distance_m/time_s,
         log10_dist = log10(event_distance_m),
         log10_time = log10(time_s))

df %>% glimpse()

df %>% ggplot(aes(x=time_s, y=speed_m_s)) + 
  geom_point(alpha = 0.2)

#Visualize speed distribution
df %>%
  ggplot(aes(x=speed_m_s, y=factor(event_distance_m), fill = sex)) + 
  geom_density_ridges(alpha = 0.2, scale = 1) + 
  scale_fill_brewer(palette = 'Set1')



#Visualize w/ some scatter
df %>%
  ggplot(aes(x=event_distance_m, y=time_s/60, color = sex)) + 
  geom_point(size=0.5, pch=16, alpha = 0.5, position = position_jitter(height=0, width = 0.02)) + 
  scale_color_brewer(palette = "Set1") + 
  scale_x_log10() + 
  scale_y_log10()

#Ensure we did in fact pull correct performances

df %>% 
  group_by(athlete_season_id) %>%
  count() %>%
  arrange(n) %>%
  head(10)

#Check male/female and hs/college distro
df %>%
  group_by(athlete_level) %>%
  count(sex) %>%
  mutate(percentage = n/sum(n))

df %>%
  count(athlete_level) %>%
  mutate(percentage = n/sum(n))
#Pretty ok with 80/20 split because HS is more prone to selection bias anyways


sprintf("Analyzing %d performances from %d athletes and %d athlete-seasons", 
        dim(df)[1], 
        df %>% pull(athlete) %>% unique() %>% length(),
        df %>% pull(athlete_season_id) %>% unique() %>% length())



# ----- Critical speed analysis ------

#Wrapper to do critical speed analysis, statistically appropriate way
#Disregarding WLS for now
analyze_cs <- function(this_df, this_asid, z_val = 1.96){
  #Model that's appropriate for time-uncertainty (errors on y only)
  cs_mod <- lm(time_s ~ event_distance_m, data = this_df)
  
  beta0 <- cs_mod$coefficients[1] %>% as.numeric() #Avoids named row issues
  beta0_se <- summary(cs_mod)$coefficients[1,"Std. Error"] %>% as.numeric()
  beta0_cv <- beta0_se/beta0
  
  beta1 <- cs_mod$coefficients[2] %>% as.numeric()
  beta1_se <- summary(cs_mod)$coefficients[2,"Std. Error"] %>% as.numeric()
  beta1_cv <- beta1_se/beta1
  
  cs <- 1/beta1 %>% as.numeric()
  cs_plus <- 1/(beta1 - z_val*beta1_se)  %>% as.numeric() #NOTE: Assumes Gaussian, disregards t-distribution fat tails
  cs_minus <- 1/(beta1 + z_val*beta1_se) %>% as.numeric() # (this is what all the previous lit. does)
                                                          # the "right" way to do this is probably fully Bayesian
  
  d_prime = -1*beta0*cs %>% as.numeric()
  
  r_sq <- summary(cs_mod)$r.squared
  #Return this, store in list, then use bind_rows()
  cs_results = data.frame(
    athlete_season_id = this_asid, #Can left join later for rest of info like school and perf.
    cs = cs,
    cs_inverse = beta1,
    cs_plus = cs_plus,
    #Care, minus for plus and plus for minus
    cs_plus_inverse = beta1 - z_val*beta1_se,
    cs_minus = cs_minus,
    cs_minus_inverse = beta1 + z_val*beta1_se,
    cs_cv = beta1_cv,
    d_prime = d_prime, #Note this is NOT a true Coef of Variation! 
    d_prime_cv = beta0_cv, #But lit calls it "coefficient of variation" anyays
    r_sq = r_sq
  )
  return(cs_results)
}


# What Z value do you want? 1.96 for 95% or 1.645 for 90%
Z_VALUE <- 1.645 # 90% is reasoanble since we have "worse than expected" error b/c best perf. picks



all_asid <- df %>% pull(athlete_season_id) %>% unique()
cs_list <- list()

for (i in 1:length(all_asid)){
  if (i %% 200 == 0) print(sprintf("%d / %d",i,length(all_asid)))
  
  this_asid <- all_asid[i]
  this_df <- df %>% filter(athlete_season_id == this_asid) %>%
    mutate(speed = event_distance_m/time_s)
  
  cs_results <- analyze_cs(this_df, this_asid, z_val = Z_VALUE)
  cs_list[[i]] <- cs_results
}

all_cs <- bind_rows(cs_list)
all_cs %>% glimpse()


big_df <- df %>%
  left_join(all_cs, by="athlete_season_id") %>%
  mutate(sex= factor(sex),
         athlete_level = factor(athlete_level))


big_df %>% glimpse()


summary_df <- big_df %>%
  group_by(athlete_season_id) %>%
  slice(1) %>%
  ungroup()


# --- Fit quantile models ----

#Test on just CS- ('threshold') 0.5 quantile
qmod <- qgam(cs_minus ~ 1 + log10_dist + log10_time + log10_dist:log10_time,
             data = big_df, qu = 0.5)
summary(qmod)

#Note: no effect on sex, trivial effect of athlete level (<1% point change in deviance)
qmod_test <- qgam(cs_minus ~ 1 + log10_dist + log10_time + log10_dist:log10_time + sex + athlete_level,
             data = big_df, qu = 0.5)
summary(qmod_test)
#Hence no need to include them as predictors. 

gratia::appraise(qmod) #QQ fit is no cause for concern; qgam does not assume normality



#Plot resids
lcheck_df <- data.frame(fitted = qmod$fitted.values,
                        actual = big_df$cs_minus,
                        resid=  qmod$residuals,
                        sex = big_df$sex,
                        athlete_level = big_df$athlete_level,
                        event_name = big_df$event_name)

resid_plot <- lcheck_df %>%
  mutate(event_name = factor(event_name, 
                             levels = c("800m","1000m", "1500m", "1600m", "mile", "3000m", "3200m", "5000m", "10000m"))) %>%
  ggplot(aes(x=fitted, y=actual, color = sex)) + 
  geom_point(alpha=0.25, size=1 ,pch=16) + 
  geom_abline(color = "black", linewidth = 0.5) + 
  facet_wrap(~event_name) + 
  scale_color_brewer(palette = "Set1") + 
  scale_x_continuous(limits = c(2.8,6.1),
                     name = "Predicted threshold speed (m/s)") + 
  scale_y_continuous(limits = c(2.8,6.1),
                     name = "Actual threshold speed (m/s)") + 
  ggtitle("Model performance: predicted vs. actual threshold speed") + 
  labs(color = "Legend:") + 
  theme_bw() +
  theme(legend.position = "bottom")

resid_plot

# -- Fit full models for web app

fit_linear_qmod <- function(y_outcome, q_prob){
  mod_formula <- as.formula(paste(y_outcome, "~ 1 + log10_dist + log10_time + log10_dist:log10_time"))
  qmod_fitted <- qgam(mod_formula, data = big_df, qu = q_prob)
  
  #Get coefs
  beta0 <- as.numeric(coefficients(qmod_fitted)['(Intercept)'])
  beta1 <- as.numeric(coefficients(qmod_fitted)['log10_dist'])
  beta2 <- as.numeric(coefficients(qmod_fitted)['log10_time'])
  beta3 <- as.numeric(coefficients(qmod_fitted)['log10_dist:log10_time'])
  
  #Data frame with results
  mod_df <- list(y_outcome = y_outcome,
                 q_prob = q_prob,
                 beta0 = beta0,
                 beta1_log10_dist = beta1,
                 beta2_log10_time = beta2,
                 beta3_interaction = beta3)
  return(mod_df)
}

outcome_iter <- rep(c("cs", "cs_minus", "cs_plus"), each = 3)
qprob_iter <- rep(c(0.1,0.5,0.9), times=3) #10th, 50th, 90th percentiles 

result_list <- list()

for (i in 1:length(outcome_iter)){
  #generate indexable name
  mod_name <- sprintf("%s_%.0f0", outcome_iter[i], qprob_iter[i]*10)
  iter_results <- fit_linear_qmod(outcome_iter[i], qprob_iter[i])
  result_list[[mod_name]] <- iter_results
}

linear_qmod_results <- result_list

# -- exoprt as json for easy javascriptification
linear_qmod_json <- toJSON(linear_qmod_results, pretty=TRUE, auto_unbox=TRUE)
write(linear_qmod_json, "linear_qmod_results_hs_college.json")
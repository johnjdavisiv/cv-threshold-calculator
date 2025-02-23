# Fit quantile gams to critical speed data

library(tidyverse)
library(mgcv)
library(qgam)
library(gratia)
library(jsonlite)
library(sp)
library(pracma)
library(reshape2)
library(viridis)

# ---- Global params ----
AGE_CENTER <- 22

CS_LONGEST_DUR <- 8 # How long must longest race be? 8:00 seems reasonable to rule out the mile
CS_MAX_DUR <- 25 #max duration for CS fitting --> 25 minutes
CS_Z_VALUE <- 1.96 #What normal dist Z-value for critical speed? 95% (1.96) is literature standard



# Define the function that converts decimal minutes per mile to "M:SS"
pace_to_str <- function(pace) {
  minutes <- floor(pace)
  # Compute seconds and round to the nearest integer
  seconds <- round((pace - minutes) * 60)
  # Adjust in case seconds round to 60
  seconds <- ifelse(seconds == 60, 0, seconds)
  minutes <- ifelse(seconds == 0 & (pace - minutes) * 60 >= 59.5, minutes + 1, minutes)
  sprintf("%d:%02d", minutes, seconds)
}


# --- Read data and set up for modeling ---
df_all <- read_csv("complied_performance_data.csv") %>%
  mutate(sex = factor(sex),
         athlete_level = factor(athlete_level, levels = c("college", "high_school", "masters", "adult_bth"))) %>%
  mutate(speed_m_s = event_distance_m / time_s) %>%
  #Add modeling variables
  mutate(log10_time = log10(time_s),
         log10_dist = log10(event_distance_m),
         log10_speed = log10(speed_m_s),
         age_c = age - AGE_CENTER) %>%
  filter(age <= 80)

df %>% glimpse()


# -- Data cleaning (note this was done on raw data, does nothing here)
new_cs_candidates <- df_all %>%
  group_by(athlete_season_id) %>%
  summarize(longest_race = max(time_min)) %>%
  arrange(longest_race) %>%
  filter(longest_race > CS_LONGEST_DUR)

# Now, filter to athletes with AT LEAST THREE unique perfs
df_inter <- df_all %>% 
  filter(time_min <= CS_MAX_DUR) %>%
  filter(athlete_season_id %in% new_cs_candidates$athlete_season_id) %>%
  group_by(athlete_season_id, event_distance_m) %>%
  summarize(best_perf = min(time_min)) %>%
  arrange(athlete_season_id, event_distance_m) %>%
  ungroup() %>%
  mutate(race_speed_m_s = event_distance_m/(best_perf*60))

df_inter %>% glimpse()

# filter so all performances get monotonically slower as event distance increases
df_valid <- df_inter %>%
  group_by(athlete_season_id) %>%
  arrange(event_distance_m, .by_group = TRUE) %>%
  filter(all(diff(race_speed_m_s) < 0)) %>%
  ungroup()

# explore invalid ones
df_invalid <- df_inter %>%
  group_by(athlete_season_id) %>%
  arrange(event_distance_m, .by_group = TRUE) %>%
  filter(any(diff(race_speed_m_s) >= 0)) %>%
  ungroup()


new_cs_athletes <- df_all %>% 
  filter(time_min <= CS_MAX_DUR) %>%
  filter(athlete_season_id %in% df_valid$athlete_season_id) %>%
  group_by(athlete_season_id, event_distance_m) %>%
  summarize(best_perf = min(time_min)) %>%
  ungroup() %>%
  group_by(athlete_season_id) %>%
  summarize(n = n()) %>%
  arrange(desc(n)) %>%
  filter(n >= 3)


df_analyze <- df_all %>% 
  filter(athlete_season_id %in% new_cs_athletes$athlete_season_id)

# -----  CS analysis ----- 


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


all_asid <- df_analyze %>% pull(athlete_season_id) %>% unique()
cs_list <- list()

for (i in 1:length(all_asid)){
  if (i %% 200 == 0) print(sprintf("%d / %d",i,length(all_asid)))
  
  this_asid <- all_asid[i]
  this_df <- df_analyze %>% filter(athlete_season_id == this_asid) %>%
    mutate(speed = event_distance_m/time_s) %>%
    #SUPER IMPORTANT! Otherwise you will include the wrong perfs! 
    filter(time_min < CS_MAX_DUR)
  #In other words, even for people who ran 10k (or slow 5k) IGNORE THOSE for CS analysis
  # (even though we want them in the dataset for prediction)
  
  cs_results <- analyze_cs(this_df, this_asid, z_val = CS_Z_VALUE)
  cs_list[[i]] <- cs_results
}

all_cs <- bind_rows(cs_list)
all_cs %>% glimpse()


#There are a few implausibilities here: D' values below 50, for example
# Also there is a tendency for 800/1000/1609 runners to dominate
# Could try requiring one performance lasting longer than, say, 7.5 minutes

big_df <- df_analyze %>%
  left_join(all_cs, by="athlete_season_id") %>%
  #Filtering on fit quality
  filter(cs_cv < 0.05) %>%
  mutate(sex = factor(sex),
         athlete_level = factor(athlete_level, levels = c("college", "high_school", "adult_bth", "masters")))





# Visualize
big_df %>%
  ggplot(aes(x=speed_m_s, y=cs)) + 
  geom_point(alpha = 0.3) + 
  geom_abline(color="red") + 
  facet_wrap(~event_distance_m)

# Can't have missingness when modeling age (gams are robust to MAR though so no worries)
#    It's like ~3% of data, all college 
mod_df <- big_df %>% 
  drop_na(age)


# ------ Fitting and grid --------------

#For export to json

# --- Setting up Z grid
n_grid <- 50 #See later for justification - discretization error is very low at 50 (see end for plots)
#Use same grid for all queries -- store separeably not duplicate

#Need a weird sequence to get all track events "on the nose"
event_seq <- c(seq(800,1600,by=25),
               1609.344, #one mile
               seq(1650,3200, by=50),
               3218.688, #two miles
               seq(3250,4800, by=50),
               4828.032, #three miles
               seq(4850,5000, by=50),
               seq(5100,8000, by=100),
               8046.72, #five miles
               seq(8100,12000, by=100))

log10_dist_grid <- log10(event_seq)
#Want equally spaced ON LOG SCALE - 1.5 minutes to 80 minutes
log10_time_grid = seq(log10(60*1.5), log10(60*80), length.out = n_grid)

grid_df <- expand_grid(log10_dist_grid, log10_time_grid) %>%
  mutate(age_c = 0, athlete_level = factor("college"), #Most common group, makes sense
         log10_dist = log10_dist_grid,
         log10_time = log10_time_grid)

#Age grid for smooth preds (will be a real lookup table no interp needed, hence by=1)
age_range = c(10,90)
age_seq <- seq(age_range[1], age_range[2], by=1)

#Debug
y_outcome <- "cs"
q_prob <- 0.5


mod_df %>%
  filter(cs > 2.9) %>%
  ggplot(aes(x=log10_time,y=log10_speed, color = cs)) + 
  geom_point(alpha = 0.5) +
  scale_color_viridis(option="magma") + 
  lims(x=c(2,4), y=c(0.3,0.9))


# --- Generic qgam fitting function
fit_qmod <- function(y_outcome, q_prob){
  
  smooth_form <- as.formula(paste(y_outcome,"~ te(log10_dist, log10_time, bs=c('cr', 'cr'), k=c(8,16)) + athlete_level + s(age_c,k=8, bs='cr')"))
  learn_form <- as.formula("~ s(log10_time, k=8, bs='cr')")
  form_list <- list(smooth_form, learn_form)
  
  qmod_fitted <- qgam(form_list, data = mod_df, qu = q_prob)
  
  #summary(qmod_fitted)
  #gratia::draw(qmod_fitted, dist=0.2)
  #gratia::appraise(qmod_fitted)
  
  #Get intercept
  beta0 <- as.numeric(coefficients(qmod_fitted)['(Intercept)'])
  
  #Get age smooth grid - none of the other variables matter since we use type = terms
  df_smooth <- data.frame(log10_time = 0, log10_dist = 0, athlete_level = factor("college"),
                          age = age_seq) %>%
    mutate(age_c = age - AGE_CENTER)
  smooth_preds <- predict(qmod_fitted, type = "terms", newdata = df_smooth)
  df_smooth$age_smooth <- smooth_preds[,"s(age_c)"]
  
  #Make Z matrix
  Z_terms <- predict(qmod_fitted, newdata = grid_df, type="terms")
  te_smooth <- Z_terms[,"te(log10_dist,log10_time)"]
  #in "long" format, need as matrix
  
  te_mat <- matrix(te_smooth, 
                   nrow = length(log10_dist_grid), 
                   ncol = length(log10_time_grid),
                   byrow = TRUE)
  #This is arranged so X is columns (distance), time is rows
  dim(te_mat)
  length(log10_dist_grid)
  
  mod_results <- list(y_outcome = y_outcome,
                      q_prob = q_prob,
                      beta0 = beta0,
                      age_smooth = df_smooth$age_smooth,
                      te_smooth = te_mat,
                      fitted_mod = qmod_fitted) 
  return(mod_results)
}

# --- Loop through and fit ---------



outcome_iter <- rep(c("cs", "cs_minus", "cs_plus"), each = 3)
qprob_iter <- rep(c(0.1,0.5,0.9), times=3) #10th, 50th, 90th percentiles 

result_list <- list()

for (i in 1:length(outcome_iter)){
  #generate indexable name
  mod_name <- sprintf("%s_%.0f0", outcome_iter[i], qprob_iter[i]*10)
  iter_results <- fit_qmod(outcome_iter[i], qprob_iter[i])
  result_list[[mod_name]] <- iter_results
}

names(result_list)

# Add global x and y arrays for Z matrix indexing

result_list[["age_grid"]] <- age_seq
result_list[["log10_dist_grid"]] <- log10_dist_grid
result_list[["log10_time_grid"]] <- log10_time_grid


#Drop fitted model from list to jsonify
json_list <- result_list
mod_names <- names(json_list)[stringr::str_starts(names(json_list), "cs")]
for (nam in mod_names){
  json_list[[nam]]$fitted_mod <- NULL
}


# -- exoprt as json for easy javascriptification
qmod_json <- toJSON(json_list, pretty=TRUE, auto_unbox=TRUE)
write(qmod_json, "te_age_qmod_results_v2025-02-21.json")


# ------- Test cases --------------


test_1mi <- expand.grid(event_distance_m = 1600,
                        time_min = seq(4,6,by=0.25)) %>%
  mutate(time_s = time_min*60,
         log10_time = log10(time_s),
         log10_dist = log10(event_distance_m))
test_2mi <- expand.grid(event_distance_m = 3200,
                        time_min = seq(9,12,by=0.5)) %>%
  mutate(time_s = time_min*60,
         log10_time = log10(time_s),
         log10_dist = log10(event_distance_m))

test_5k <- expand.grid(event_distance_m = 5000,
                       time_min = c(14,15,15.5,15.75,16,17,18,18.66667,20,24,30)) %>%
  mutate(time_s = time_min*60,
         log10_time = log10(time_s),
         log10_dist = log10(event_distance_m))

test_10k <- expand.grid(event_distance_m = 10000,
                        time_min = seq(30,45,by=1)) %>%
  mutate(time_s = time_min*60,
         log10_time = log10(time_s),
         log10_dist = log10(event_distance_m))



# -- Compare test cases on live web app
test_case_df <- bind_rows(test_1mi, test_2mi, test_5k, test_10k) %>%
  mutate(pace_min_mi_dec = time_min/event_distance_m*1609.344,
         pace_min_mi = pace_to_str(pace_min_mi_dec)) %>%
  mutate(athlete_level = factor("college"),
         age_c = 0) %>%
  #predictions
  mutate(thresh_pred = predict(result_list[["cs_minus_10"]]$fitted_mod, type="response", newdata = .) %>% as.vector(),
         cv_pred = predict(result_list[["cs_50"]]$fitted_mod, type="response", newdata = .) %>% as.vector(),
         vo2_pred = predict(result_list[["cs_plus_90"]]$fitted_mod, type="response", newdata = .) %>% as.vector()) %>%
  mutate(thresh_pace = pace_to_str(1609/thresh_pred/60),
         cv_pace = pace_to_str(1609/cv_pred/60),
         vo2_pace = pace_to_str(1609/vo2_pred/60)) %>%
  select(event_distance_m, time_min, pace_min_mi, thresh_pace, cv_pace, vo2_pace, everything())


test_case_df %>% glimpse()



# ---------- Look at discretization error --------------

# -- Define convex hull grid
event_minmax = data.frame(event_distance_m = c(800,800,
                                               1500,1500,
                                               3000,3000,
                                               5000,5000,
                                               10000,10000),
                          event_time_min = c(1+35/60,4.5, # 800m: 1:35 to 4:30
                                             3.3, 9.5, #1500m: 3:18 to 9:30
                                             7,20, #3000m: 7:00 to 20:00
                                             12.3,32, #5000m: 12:00 to 32:00
                                             25, 70)) %>% #10k: 25:00 to 1:10
  mutate(event_time_s = event_time_min*60)

# Calculate convex hull indices
hull_indices <- chull(event_minmax$event_distance_m, event_minmax$event_time_s)
# To close the polygon, append the first index to the end
hull_indices <- c(hull_indices, hull_indices[1])
hull_data <- event_minmax[hull_indices, ] %>%
  mutate(log10_dist = log10(event_distance_m),
         log10_time = log10(event_time_s))

hull_points <- event_minmax[hull_indices,] 
hull_point_matrix <- hull_points %>%
  select(event_distance_m, event_time_s) %>%
  as.matrix()


# --- Fit exemplar model
cs_mod <- qgam(cs ~ te(log10_dist,log10_time, bs=c('cr', 'cr'), k=c(8,8)) + athlete_level + s(age_c,k=8, bs='cr'),
               qu = 0.5, data = mod_df)

summary(cs_mod)


qtest_df <- data.frame(athlete_level = factor("college"), age_c = 0,
                       log10_dist = c(2,3.2,4,5),
                       log10_time = c(2,2.38,3,4))


foo_pred <- predict(cs_mod, newdata = qtest_df, type="terms")
foo_pred

ng_test_vals <- c(5,10,15,20,25,30,35,40,50,75,100,150,200,250,500)

qtest_df$expected_te <- foo_pred[,"te(log10_dist,log10_time)"]
qtest_df


response_test <- predict(cs_mod, newdata = qtest_df, type="response")
qtest_df$expected_yhat <- response_test


grid_results <- list()

for (i in 1:length(ng_test_vals)){
  this_ng <- ng_test_vals[i]
  
  
  this_log10_time_grid = seq(log10(60*1.5), log10(60*80), length.out = this_ng)
  
  this_grid_df <- expand_grid(log10_dist_grid, this_log10_time_grid) %>%
    mutate(age_c = 0, athlete_level = factor("college"),
           log10_dist = log10_dist_grid,
           log10_time = this_log10_time_grid)
  this_grid_df$yhat <- predict(cs_mod, newdata = this_grid_df, type="response")
  
  #Test this interp matrix
  this_ymat <- matrix(this_grid_df$yhat, 
                      nrow = length(log10_dist_grid), 
                      ncol = length(this_log10_time_grid),
                      byrow = TRUE)
  
  #Generate runiform data ....
  
  n_random_points <- 10000 #Generate ~5x as much as you need since ~80% will be filtered
  
  #generate runiform() data along the range of values in grid_df (log-spaced!)
  #Reject those outside our event convex hull
  # do bilinear interpolation with pracma setup
  # compaer against actual model results
  
  log10_dist_grid %>% range()
  
  log10_dist_min <- min(log10_dist_grid)
  log10_dist_max <- max(log10_dist_grid)
  log10_time_min <- min(log10_time_grid)
  log10_time_max <- max(log10_time_grid)
  
  set.seed(1989)
  q_log10_dist_random <- runif(n_random_points, min = log10_dist_min, max = log10_dist_max)
  q_log10_time_random <- runif(n_random_points, min = log10_time_min, max = log10_time_max)
  
  # Filter only inside 
  query_df <- data.frame(log10_dist = q_log10_dist_random,
                         log10_time = q_log10_time_random)
  
  
  query_df_filtered <- query_df %>%
    filter(
      point.in.polygon(
        log10_dist, log10_time, 
        hull_data$log10_dist, 
        hull_data$log10_time
      ) > 0
    ) %>%
    mutate(athlete_level = factor("college"),
           age_c = 0)
  
  query_df_filtered$y_true <- predict(cs_mod, newdata = query_df_filtered)
  
  # Now do bilinear interpolatino
  
  dim(this_ymat)
  length(log10_dist_grid)
  length(this_log10_time_grid)
  
  #HUH DANGER with transpose
  yhat_interp <- pracma::interp2(x = log10_dist_grid, y = this_log10_time_grid, Z = t(this_ymat), 
                                 xp = query_df_filtered$log10_dist,
                                 yp = query_df_filtered$log10_time,
                                 method = "linear")
  
  
  query_df_filtered$y_interp <- yhat_interp
  
  result_df <- query_df_filtered %>%
    mutate(abs_error = abs(y_true - y_interp),
           mape = 100*abs_error/y_true) %>%
    mutate(n_grid = this_ng)
  
  
  grid_results[[i]] <- result_df
  
  
  print(sprintf("Grid: %i - Mean percent error: %.2f", this_ng, mean(result_df$mape)))
  
}

all_grid_results <- bind_rows(grid_results)


plot_df <- all_grid_results %>% 
  group_by(n_grid) %>% 
  summarize(abs_error = mean(abs_error),
            mape = mean(mape))


min(plot_df$mape)
y_limits <- c(0.0001, 25)

y_breaks <- c(0.01, 0.1,1,2,3,5,10,25)
y_labels <- sprintf("%g%%", y_breaks)

all_grid_results %>%
  ggplot(aes(x=factor(n_grid), y=mape, fill=factor(n_grid))) + 
  geom_violin(alpha = 0.5) + 
  geom_point(data = plot_df, size=2) + 
  scale_y_log10(breaks = y_breaks,
                limits = y_limits,
                labels = y_labels)

